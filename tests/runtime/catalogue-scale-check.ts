import assert from 'node:assert/strict';
import { scaleCatalogue } from '../../tests/fixtures/catalogue-scale';
import { createLibraryRepository } from '../../server/libraries/repository';
import { handleLibraryRequest } from '../../server/libraries/http';
import { searchLibraries } from '../../src/domain/library-search';
import { parseSearchRequest } from '../../src/domain/search-request';
import { createCataloguePlan, parseCatalogueImport } from '../../server/data/catalogue-import';
import { emptyLibraryContent } from '../../src/domain/admin';

/** Disposable local Pages/D1 verification only; never installed in app Functions. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const scaled = scaleCatalogue(100);
  const notreDame = scaled[0];
  notreDame.institution = 'notre-dame';
  notreDame.content.latitude = -32.4;
  const allDay = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }));
  notreDame.content.schedule.building.recurring = allDay;
  notreDame.content.schedule.access[0] = { ...notreDame.content.schedule.building, group: 'notre-dame',
    requirement: 'Synthetic Notre Dame card', needsActiveCredentials: true };
  await env.DB.batch(scaled.flatMap((record) => [
    env.DB.prepare('INSERT INTO library(id,slug,institution_id,is_fixture) VALUES (?,?,?,1)').bind(record.id, record.slug, record.institution),
    env.DB.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at,published_at) VALUES (?,?,'published',?,0,0)").bind(record.revisionId, record.id, JSON.stringify(record.content)),
    env.DB.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at) VALUES (?,?,'archived',?,0)").bind(`${record.id}-old`, record.id, JSON.stringify(record.content)),
  ]));
  const repository = createLibraryRepository(env);
  const catalogue = [];
  let afterSlug: string | undefined;
  for (;;) {
    const page = await repository.listPublished({ includeFixtures: true, limit: 100, afterSlug });
    catalogue.push(...page);
    if (page.length < 100) break;
    afterSlug = page.at(-1)!.slug;
  }
  assert(catalogue.length > 100, 'Exercise repository reads beyond the first 100 records.');
  const clock = Date.parse('2026-10-12T06:00:00Z');
  const request = (query: string) => new Request(`https://example.invalid/api/libraries?${query}`);
  for (const query of ['', 'cards=notre-dame', 'publicAccess=true', 'cards=uwa&open24Hours=true', 'institutions=notre-dame']) {
    const params = new URLSearchParams(query);
    params.set('start', '2026-10-12T14:00');
    const all = searchLibraries(catalogue, { ...parseSearchRequest(params, clock), limit: 100 });
    const expected: ReturnType<typeof searchLibraries> | null = all.total > 100
      ? searchLibraries(catalogue, { ...parseSearchRequest(params, clock), limit: 100, offset: 100 }) : null;
    const ids: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      params.set('offset', String(offset));
      const response = await handleLibraryRequest(request(params.toString()), env, 'search', undefined, clock, { includeFixtures: true });
      assert.equal(response.status, 200);
      const payload = await response.json<ReturnType<typeof searchLibraries>>();
      assert(payload.results.length <= 10);
      assert.equal(payload.total, all.total);
      ids.push(...payload.results.map((result) => result.library.id));
      offset = payload.nextOffset;
    }
    assert.deepEqual(ids, [...all.results, ...(expected?.results ?? [])].map((result) => result.library.id));
    assert.equal(new Set(ids).size, ids.length);
    if (query === 'cards=notre-dame') assert.equal(ids[0], notreDame.id, 'Notre Dame card affects ranking.');
    if (query === 'institutions=notre-dame') assert.deepEqual(ids, [notreDame.id], 'Explicit institution selection excludes other libraries.');
  }
  const publicResponse = await handleLibraryRequest(request('start=2026-10-12T14:00'), env, 'search', undefined, clock);
  const publicPayload = await publicResponse.json<ReturnType<typeof searchLibraries>>();
  assert(publicPayload.results.every((result) => !result.library.isFixture));

  // Metadata from a representative indexed catalogue query, not a claim that
  // ten returned cards cost ten row reads. Include archived history in the DB.
  const read = await env.DB.prepare(`SELECT l.id,l.slug,l.institution_id,r.id AS revision_id,r.content
    FROM library l INNER JOIN institution i ON i.id=l.institution_id
    INNER JOIN library_revision r ON r.library_id=l.id
    WHERE r.status='published' ORDER BY l.slug LIMIT 100`).all();
  assert.equal(read.results.length, 100);
  assert(read.meta.rows_read < 600, 'Published catalogue reads should not scan archived history.');

  const content = { ...emptyLibraryContent(), name: 'Synthetic import verification', address: 'Synthetic test address',
    sources: [{ id: 'import-check', kind: 'official', label: 'Synthetic import source', url: 'https://example.invalid/import', checkedOn: '2026-10-10' }] };
  const manifest = parseCatalogueImport({ version: 1, checkedOn: '2026-10-10', libraries: [
    { id: 'runtime-import', slug: 'runtime-import', institution: 'notre-dame', content },
  ] });
  const plan = createCataloguePlan(manifest, [], []);
  await env.DB.batch(plan.statements.map((statement) => env.DB.prepare(statement)));
  assert.equal(await repository.getPublishedBySlug('runtime-import'), null);
  const draft = await repository.getLatestDraft('runtime-import');
  assert(draft);
  await repository.publishDraft(draft.revisionId);
  await repository.unpublish('runtime-import');
  const repeat = createCataloguePlan(manifest, [{ id: 'runtime-import', slug: 'runtime-import', institution: 'notre-dame', isFixture: false }], []);
  assert.equal(repeat.statements.length, 0);
  assert.equal(await repository.getPublishedBySlug('runtime-import'), null);
  assert.equal((await env.DB.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  return Response.json({ ok: true, syntheticRecords: scaled.length, catalogueRecords: catalogue.length,
    representativeReadRows: read.meta.rows_read, representativeRowsReturned: read.results.length,
    checks: ['full-catalogue-ranking', 'ten-card-pages', 'notre-dame', 'fixture-exclusion', 'draft-import', 'preserved-archives'] });
};
