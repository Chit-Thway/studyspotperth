import { describe, expect, it, vi } from 'vitest';
import { scaleCatalogue } from '../../../tests/fixtures/catalogue-scale';
import { useLibrarySearch } from './use-catalogue-search';
import type { PublicCatalogue } from '../../domain/public-catalogue';

const source = vi.hoisted(() => ({ data: null as PublicCatalogue | null, loading: false, error: null, retry: () => {} }));
// Exercise the search hook's result contract with a fixed catalogue and clock.
vi.mock('react', () => ({ useEffect: () => {}, useMemo: (read: () => unknown) => read(), useState: () => [Date.parse('2026-10-12T06:00:00Z')] }));
vi.mock('./catalogue-context', () => ({ usePublicCatalogue: () => source }));

describe('map catalogue results', () => {
  it('includes every matching library beyond list pagination and the API page limit', () => {
    source.data = { schemaVersion: 1, libraries: scaleCatalogue(125), origins: [] };
    const query = 'start=2026-10-12T14:00&limit=10&offset=20';
    const list = useLibrarySearch(query).data!;
    const map = useLibrarySearch(query, null, true, true).data!;
    expect(list.results).toHaveLength(10);
    expect(map.results).toHaveLength(125);
    expect(map.offset).toBe(0);
    expect(map.nextOffset).toBeNull();
    expect(map.results.slice(20, 30)).toEqual(list.results);
  });
  it('keeps opening filters and custom-origin distances consistent with the list', () => {
    source.data = { schemaVersion: 1, libraries: scaleCatalogue(125), origins: [] };
    const origin = { latitude: -31.98, longitude: 115.94 };
    const query = 'start=2026-10-12T14:00&openNow=true&limit=10';
    const list = useLibrarySearch(query, origin).data!;
    const map = useLibrarySearch(query, origin, true, true).data!;
    expect(map.results.length).toBeGreaterThan(10);
    expect(map.results.every((result) => result.opening.status === 'open')).toBe(true);
    expect(map.results.slice(0, 10)).toEqual(list.results);
    expect(map.request.origin).toMatchObject(origin);
  });
});
