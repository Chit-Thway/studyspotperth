import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPublicCatalogue } from './catalogue-client';
import { scaleCatalogue } from '../../../tests/fixtures/catalogue-scale';
import { catalogueSearchRequest } from '../../domain/public-catalogue';
import { pageLibraryCandidates, rankLibraryCandidates, searchLibraries } from '../../domain/library-search';

afterEach(() => vi.unstubAllGlobals());
describe('shared browser catalogue', () => {
  it('downloads public facts once and reuses the same snapshot on a version check', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1, libraries: scaleCatalogue(100), origins: [] }),
      { headers: { ETag: 'W/"first"' } })).mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    const first = await readPublicCatalogue(null, signal);
    expect(first.catalogue.libraries).toHaveLength(100);
    expect(fetcher.mock.calls[0][0]).toBe('/api/catalogue');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
    expect(await readPublicCatalogue(first, signal)).toBe(first);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ headers: { 'If-None-Match': 'W/"first"' } });
  });
  it('preserves ranking and pagination locally and replaces withdrawn records on refresh', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1, libraries: scaleCatalogue(100), origins: [] }),
      { headers: { ETag: 'W/"first"' } })).mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1, libraries: [], origins: [] }),
      { headers: { ETag: 'W/"second"' } }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    const first = await readPublicCatalogue(null, signal);
    const request = catalogueSearchRequest(first.catalogue, new URLSearchParams('cards=uwa&start=2026-10-12T14:00'), Date.parse('2026-10-12T06:00Z'));
    const ranked = rankLibraryCandidates(first.catalogue.libraries, request);
    for (const offset of [0, 10]) {
      const page = pageLibraryCandidates(ranked, { ...request, offset });
      const expected = searchLibraries(first.catalogue.libraries, { ...request, offset });
      expect(page.results.map((library) => library.id)).toEqual(expected.results.map((item) => item.library.id));
      expect(page.total).toBe(expected.total);
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readPublicCatalogue(first, signal)).catalogue.libraries).toEqual([]);
  });
});
