import assert from 'node:assert/strict';
import { createLaunchStatements, launchLibraries } from '../../server/data/launch-libraries';
import { createLibraryRepository } from '../../server/libraries/repository';
import { handleLibraryRequest } from '../../server/libraries/http';
import { parsePerthTime } from '../../src/domain/perth-time';

type SearchPayload = { results: { library: { id: string; institution: string } }[] };

/** Copied into the disposable verification server only. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const original = launchLibraries[0];
  const legacy = { ...original.content, photos: [], latitude: null, longitude: null,
    sources: original.content.sources.filter((source) => !['map-location', 'map-license', 'photo', 'photo-license'].includes(source.id)) };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO library(id,slug,institution_id,is_fixture) VALUES (?,?,?,0)').bind(original.id, original.slug, original.institution),
    env.DB.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at,published_at) VALUES (?,?,'published',?,0,0)").bind(`${original.id}-initial`, original.id, JSON.stringify(legacy)),
  ]);
  // Execute the same import twice to verify replay on the real D1 runtime.
  for (let replay = 0; replay < 2; replay++) {
    // SQL statements contain semicolons in JSON text; do not split the generated SQL.
    await env.DB.batch(createLaunchStatements().map((statement) => env.DB.prepare(statement)));
  }
  const repository = createLibraryRepository(env);
  const records = (await repository.listPublished()).filter((record) => record.id.startsWith('launch-'));
  assert.equal(records.length, 13);
  assert(records.every((record) => !record.isFixture));
  assert(records.every((record) => record.content.latitude !== null && record.content.longitude !== null));
  assert.equal((await repository.getPublishedBySlug(original.slug))?.revisionId, `${original.id}-photos-v1`);
  const clock = parsePerthTime('2026-10-05T14:00');
  const request = (query: string) => new Request(`https://example.invalid/api/libraries?start=2026-10-05T14:00&${query}`);
  const search = await handleLibraryRequest(request('cards=uwa&open24Hours=true'), env, 'search', undefined, clock);
  assert.equal(search.status, 200);
  const payload = await search.json<SearchPayload>();
  assert.equal(payload.results.filter((item) => item.library.id.startsWith('launch-')).length, 6);
  assert(payload.results.slice(0, 2).every((item) => item.library.institution === 'uwa'));
  const hardFilter = await handleLibraryRequest(request('cards=uwa&open24Hours=true&institutions=uwa'), env, 'search', undefined, clock);
  const filtered = await hardFilter.json<SearchPayload>();
  assert.equal(filtered.results.filter((item) => item.library.id.startsWith('launch-')).length, 2);
  for (const record of launchLibraries) {
    const detail = await handleLibraryRequest(request(''), env, 'detail', record.slug, clock);
    assert.equal(detail.status, 200, `Missing detail: ${record.slug}`);
  }
  const changed = records.find((record) => record.slug === 'barry-j-marshall-library')!;
  const changedContent = { ...changed.content, description: 'Synthetic administrator edit to preserve', latitude: null, longitude: null };
  const draft = await repository.createDraft(changed.id, changedContent);
  await repository.publishDraft(draft);
  await env.DB.batch(createLaunchStatements().map((statement) => env.DB.prepare(statement)));
  assert.equal((await repository.getPublishedBySlug(changed.slug))?.revisionId, draft);
  assert.equal((await repository.getPublishedBySlug(changed.slug))?.content.latitude, null);
  return Response.json({ ok: true, listings: records.length });
};
