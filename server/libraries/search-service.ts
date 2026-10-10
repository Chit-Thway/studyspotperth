import type { LibrarySearchRecord } from '../../src/domain/library';
import { evaluateLibrary, searchLibraryCandidates } from '../../src/domain/library-search';
import { createCalendarTimelineReader } from '../../src/domain/availability';
import { formatPerthTime } from '../../src/domain/perth-time';
import { DEFAULT_ORIGIN, parseSearchRequest, SearchValidationError } from '../../src/domain/search-request';
import { createLibraryRepository } from './repository';
import type { SearchOrigin } from '../../src/domain/search-request';

/** Fixture inclusion is a test-only dependency, never a public request option. */
export function createLibrarySearchService(env: Env, options: { includeFixtures?: boolean } = {}) {
  const repository = createLibraryRepository(env);
  async function origins() {
    const suburbs = await repository.listSuburbs(options);
    return [DEFAULT_ORIGIN, ...suburbs.filter((suburb) => suburb.id !== DEFAULT_ORIGIN.id)];
  }
  async function request(params: URLSearchParams, clock: number, deviceOrigin: SearchOrigin | null = null) {
    // Reject malformed input before querying the database.
    const parsed = parseSearchRequest(params, clock, deviceOrigin ?? DEFAULT_ORIGIN);
    if (deviceOrigin) return parsed;
    if (!params.has('suburb') || params.get('suburb') === DEFAULT_ORIGIN.id) return parsed;
    const origin = (await origins()).find((suburb) => suburb.id === params.get('suburb'));
    if (!origin) throw new SearchValidationError('suburb', 'This suburb is unavailable. Select an available suburb.');
    return { ...parsed, origin };
  }
  async function search(params: URLSearchParams, clock: number, deviceOrigin: SearchOrigin | null = null) {
    const parsed = await request(params, clock, deviceOrigin);
    const records: LibrarySearchRecord[] = [];
    let afterSlug: string | undefined;
    // Read every published page before ranking; never silently search just the first 100.
    for (;;) {
      const page = await repository.listPublishedSearchCandidates({ ...options, afterSlug, limit: 100 });
      records.push(...page);
      if (page.length < 100) break;
      afterSlug = page.at(-1)!.slug;
    }
    const page = searchLibraryCandidates(records, parsed);
    const fullRecords = await repository.getPublishedRevisions(page.results.map((record) => record.revisionId), options);
    const byRevision = new Map(fullRecords.map((record) => [record.revisionId, record]));
    const timeline = page.results.length ? createCalendarTimelineReader(formatPerthTime(parsed.start).slice(0, 10)) : undefined;
    const results = page.results.flatMap((candidate) => {
      const record = byRevision.get(candidate.revisionId);
      return record ? [evaluateLibrary(record, parsed, timeline)] : [];
    });
    return { ...page, results, request: parsed, timeZone: 'Australia/Perth' as const };
  }
  async function detail(slug: string, params: URLSearchParams, clock: number, deviceOrigin: SearchOrigin | null = null) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) throw new SearchValidationError('slug', 'Invalid library address.');
    const parsed = await request(params, clock, deviceOrigin);
    const record = await repository.getPublishedBySlug(slug, options);
    return record ? { result: evaluateLibrary(record, parsed), request: parsed, timeZone: 'Australia/Perth' as const } : null;
  }
  return { search, detail, origins, request };
}
