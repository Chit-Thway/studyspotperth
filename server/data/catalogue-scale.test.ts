import { describe, expect, it } from 'vitest';
import { scaleCatalogue } from '../../tests/fixtures/catalogue-scale';
import { searchLibraries } from '../../src/domain/library-search';
import { parseSearchRequest } from '../../src/domain/search-request';
import { evaluateLibrary } from '../../src/domain/library-search';

const clock = Date.parse('2026-10-12T06:00:00Z');
describe('expanded catalogue search', () => {
  it.each([82, 100])('paginates all %i records after ranking without duplicates or skipped matches', (count) => {
    const records = scaleCatalogue(count);
    const request = (offset = 0) => parseSearchRequest(new URLSearchParams(`cards=uwa&offset=${offset}`), clock);
    const all = searchLibraries(records, { ...request(), limit: 100 });
    const seen: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page = searchLibraries(records, request(offset));
      expect(page.results.length).toBeLessThanOrEqual(10);
      expect(page.total).toBe(all.total);
      seen.push(...page.results.map((result) => result.library.id));
      offset = page.nextOffset;
    }
    expect(seen).toEqual(all.results.map((result) => result.library.id));
    expect(new Set(seen).size).toBe(seen.length);
    const finalOffset = Math.floor((all.total - 1) / 10) * 10;
    expect(searchLibraries(records, request(finalOffset)).results.length).toBe(all.total - finalOffset);
  });
  it('shared date evaluation keeps access, closures and uncertainty identical to individual detail evaluation', () => {
    const records = scaleCatalogue(82);
    for (const start of ['2026-10-12T14:00', '2026-10-15T14:00', '2007-01-01T12:00']) {
      const request = parseSearchRequest(new URLSearchParams(`start=${start}&cards=uwa&limit=100`), clock);
      const result = searchLibraries(records, request);
      for (const item of result.results) expect(item).toEqual(evaluateLibrary(item.library, request));
    }
  });
});
