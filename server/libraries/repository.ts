import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { LibraryRecord, LibrarySearchRecord } from '../../src/domain/library';
import { parseLibraryContent, parseLibrarySearchContent } from '../../src/domain/parse-library';
import type { Institution } from '../../src/domain/search-context';
import { createDatabase } from '../db/client';
import { institutions, libraries, libraryRevisions, suburbs } from '../db/library-schema';

interface ReadOptions { includeFixtures?: boolean }
interface ListOptions extends ReadOptions { limit?: number; afterSlug?: string }
type SearchRow = Omit<LibrarySearchRecord, 'content' | 'isFixture'> & { content: string; isFixture: number };

/** Internal data boundary. Admin callers must authorise before using write/draft methods. */
export function createLibraryRepository(env: Env) {
  const database = createDatabase(env);
  const selectRecords = () => database.select({
    id: libraries.id, slug: libraries.slug, institution: institutions.id, isFixture: libraries.isFixture,
    revisionId: libraryRevisions.id, status: libraryRevisions.status, content: libraryRevisions.content,
  }).from(libraries).innerJoin(institutions, eq(libraries.institutionId, institutions.id))
    .innerJoin(libraryRevisions, eq(libraryRevisions.libraryId, libraries.id));
  const canonicalRecord = (row: LibraryRecord): LibraryRecord => ({ ...row, content: parseLibraryContent(row.content) });

  async function validateSnapshot(content: unknown, isFixture: boolean) {
    const result = parseLibraryContent(content);
    if (isFixture ? (!result.name.startsWith('Fictional ') || result.sources.some((source) => source.kind !== 'fixture'))
      : result.sources.some((source) => source.kind === 'fixture')) {
      throw new Error('Fictional data must be labelled and stored only in fixture libraries.');
    }
    if (result.suburbId) {
      const suburb = await database.select().from(suburbs).where(eq(suburbs.id, result.suburbId)).get();
      if (!suburb || (!isFixture && suburb.isFixture)) throw new Error('Invalid suburb reference.');
    }
    return result;
  }

  async function listPublished(options: ListOptions = {}): Promise<LibraryRecord[]> {
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Page size must be 1–100.');
    const rows = await selectRecords().where(and(eq(libraryRevisions.status, 'published'),
      options.includeFixtures ? undefined : eq(libraries.isFixture, false),
      options.afterSlug ? gt(libraries.slug, options.afterSlug) : undefined)).orderBy(asc(libraries.slug)).limit(limit).all();
    return rows.map(canonicalRecord);
  }

  async function getPublishedBySlug(slug: string, options: ReadOptions = {}): Promise<LibraryRecord | null> {
    const row = await selectRecords().where(and(eq(libraries.slug, slug), eq(libraryRevisions.status, 'published'),
      options.includeFixtures ? undefined : eq(libraries.isFixture, false))).get();
    return row ? canonicalRecord(row) : null;
  }

  async function listPublishedSearchCandidates(options: ListOptions = {}): Promise<LibrarySearchRecord[]> {
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Page size must be 1–100.');
    // Project in D1 so ranking does not transfer descriptions, photos or source documents.
    const rows = await env.DB.prepare(`SELECT l.id, l.slug, i.id AS institution, l.is_fixture AS isFixture,
      r.id AS revisionId, r.status, json_object(
        'latitude', json_extract(r.content, '$.latitude'), 'longitude', json_extract(r.content, '$.longitude'),
        'facilities', json_extract(r.content, '$.facilities'), 'wifi', json_extract(r.content, '$.wifi'),
        'schedule', json_extract(r.content, '$.schedule'),
        'sourceIds', (SELECT json_group_array(json_extract(value, '$.id')) FROM json_each(r.content, '$.sources'))
      ) AS content FROM library l JOIN institution i ON i.id = l.institution_id JOIN library_revision r ON r.library_id = l.id
      WHERE r.status = 'published' AND (? = 1 OR l.is_fixture = 0) AND l.slug > ? ORDER BY l.slug LIMIT ?`)
      .bind(Number(options.includeFixtures === true), options.afterSlug ?? '', limit)
      .all<SearchRow>();
    return rows.results.map((row) => ({ ...row, isFixture: row.isFixture === 1, content: parseLibrarySearchContent(JSON.parse(row.content)) }));
  }

  async function getPublishedRevisions(revisionIds: readonly string[], options: ReadOptions = {}): Promise<LibraryRecord[]> {
    if (!revisionIds.length) return [];
    const rows = await env.DB.prepare(`SELECT l.id, l.slug, i.id AS institution, l.is_fixture AS isFixture,
      r.id AS revisionId, r.status, r.content FROM library l JOIN institution i ON i.id = l.institution_id
      JOIN library_revision r ON r.library_id = l.id WHERE r.status = 'published'
      AND (? = 1 OR l.is_fixture = 0) AND r.id IN (${revisionIds.map(() => '?').join(',')})`)
      .bind(Number(options.includeFixtures === true), ...revisionIds).all<SearchRow>();
    return rows.results.map((row) => ({ ...row, isFixture: row.isFixture === 1, content: parseLibraryContent(JSON.parse(row.content)) }));
  }

  async function listSuburbs(options: ReadOptions = {}) {
    return database.select({ id: suburbs.id, name: suburbs.name, latitude: suburbs.latitude, longitude: suburbs.longitude })
      .from(suburbs).where(options.includeFixtures ? undefined : eq(suburbs.isFixture, false)).orderBy(asc(suburbs.name)).all();
  }

  async function getLatestDraft(libraryId: string): Promise<LibraryRecord | null> {
    const row = await selectRecords().where(and(eq(libraries.id, libraryId), eq(libraryRevisions.status, 'draft')))
      .orderBy(desc(libraryRevisions.createdAt), desc(libraryRevisions.id)).get();
    return row ? canonicalRecord(row) : null;
  }

  async function createLibrary(input: { slug: string; institution: Institution; isFixture?: boolean }, content: unknown) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 120) throw new Error('Invalid library slug.');
    const isFixture = input.isFixture ?? false;
    const canonical = await validateSnapshot(content, isFixture);
    const libraryId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    await database.batch([
      database.insert(libraries).values({ id: libraryId, slug: input.slug, institutionId: input.institution, isFixture }),
      database.insert(libraryRevisions).values({ id: revisionId, libraryId, content: canonical, status: 'draft', createdAt: new Date() }),
    ]);
    return { libraryId, revisionId };
  }

  async function createDraft(libraryId: string, content: unknown): Promise<string> {
    const library = await database.select().from(libraries).where(eq(libraries.id, libraryId)).get();
    if (!library) throw new Error('Library not found.');
    const canonical = await validateSnapshot(content, library.isFixture);
    const revisionId = crypto.randomUUID();
    await database.insert(libraryRevisions).values({ id: revisionId, libraryId, content: canonical, status: 'draft', createdAt: new Date() }).run();
    return revisionId;
  }

  async function publishDraft(revisionId: string): Promise<void> {
    const row = await selectRecords().where(and(eq(libraryRevisions.id, revisionId), eq(libraryRevisions.status, 'draft'))).get();
    if (!row) throw new Error('Draft not found.');
    const content = await validateSnapshot(row.content, row.isFixture);
    if (!row.isFixture && (!content.sources.length || content.sources.some((source) => !source.checkedOn
      || (source.kind === 'official' && !source.url)))) throw new Error('Published facts require dated sources.');
    // Both statements commit together. A stale/missing draft cannot archive the public version.
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE library_revision SET status = 'archived' WHERE library_id = ? AND status = 'published' AND EXISTS (SELECT 1 FROM library_revision WHERE id = ? AND status = 'draft')")
        .bind(row.id, revisionId),
      env.DB.prepare("UPDATE library_revision SET status = 'published', published_at = ? WHERE id = ? AND status = 'draft'")
        .bind(Date.now(), revisionId),
    ]);
    if (results[1].meta.changes !== 1) throw new Error('Draft changed before publication.');
  }

  async function unpublish(libraryId: string): Promise<void> {
    await database.update(libraryRevisions).set({ status: 'archived' })
      .where(and(eq(libraryRevisions.libraryId, libraryId), eq(libraryRevisions.status, 'published'))).run();
  }

  return { listPublished, listPublishedSearchCandidates, getPublishedRevisions, getPublishedBySlug, listSuburbs, getLatestDraft, createLibrary, createDraft, publishDraft, unpublish };
}
