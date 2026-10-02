import type { LibraryRecord } from '../../src/domain/library';
import { evaluateLibrary, searchLibraries } from '../../src/domain/library-search';
import { DEFAULT_ORIGIN, parseSearchRequest, SearchValidationError } from '../../src/domain/search-request';
import { createLibraryRepository } from './repository';

/** Fixture inclusion is a test-only dependency, never a public request option. */
export function createLibrarySearchService(env: Env, options: { includeFixtures?: boolean } = {}) {
  const repository = createLibraryRepository(env);
  async function origins() {
    const suburbs = await repository.listSuburbs(options);
    return [DEFAULT_ORIGIN, ...suburbs.filter((suburb) => suburb.id !== DEFAULT_ORIGIN.id)];
  }
  async function request(params: URLSearchParams, clock: number) {
    // Reject malformed input before querying the database.
    const parsed = parseSearchRequest(params, clock);
    if (!params.has('suburb') || params.get('suburb') === DEFAULT_ORIGIN.id) return parsed;
    const origin = (await origins()).find((suburb) => suburb.id === params.get('suburb'));
    if (!origin) throw new SearchValidationError('suburb', 'This suburb is unavailable. Select an available suburb.');
    return { ...parsed, origin };
  }
  async function search(params: URLSearchParams, clock: number) {
    const parsed = await request(params, clock);
    const records: LibraryRecord[] = [];
    let afterSlug: string | undefined;
    // Read every published page before ranking; never silently search just the first 100.
    for (;;) {
      const page = await repository.listPublished({ ...options, afterSlug, limit: 100 });
      records.push(...page);
      if (page.length < 100) break;
      afterSlug = page.at(-1)!.slug;
    }
    return { ...searchLibraries(records, parsed), request: parsed, timeZone: 'Australia/Perth' as const };
  }
  async function detail(slug: string, params: URLSearchParams, clock: number) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) throw new SearchValidationError('slug', 'Invalid library address.');
    const parsed = await request(params, clock);
    const record = await repository.getPublishedBySlug(slug, options);
    return record ? { result: evaluateLibrary(record, parsed), request: parsed, timeZone: 'Australia/Perth' as const } : null;
  }
  return { search, detail, origins };
}
