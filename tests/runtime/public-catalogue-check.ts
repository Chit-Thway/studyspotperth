import assert from 'node:assert/strict';
import { scaleCatalogue } from '../../tests/fixtures/catalogue-scale';
import { handleCatalogueRequest } from '../../server/libraries/catalogue';
import { createLibraryRepository } from '../../server/libraries/repository';
import { parsePublicCatalogue, catalogueSearchRequest } from '../../src/domain/public-catalogue';
import { searchLibraries } from '../../src/domain/library-search';

/** Installed only in the disposable local runtime. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const scaled = scaleCatalogue(100);
  await env.DB.batch(scaled.flatMap((record) => [
    env.DB.prepare('INSERT INTO library(id,slug,institution_id,is_fixture) VALUES (?,?,?,1)').bind(record.id, record.slug, record.institution),
    env.DB.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at,published_at) VALUES (?,?,'published',?,0,0)")
      .bind(record.revisionId, record.id, JSON.stringify(record.content)),
    env.DB.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at) VALUES (?,?,'archived',?,0)")
      .bind(`${record.id}-old`, record.id, JSON.stringify(record.content)),
  ]));
  const request = (etag?: string) => new Request('https://example.invalid/api/catalogue', { headers: etag ? { 'If-None-Match': etag } : {} });
  const response = await handleCatalogueRequest(request(), env, { includeFixtures: true });
  assert.equal(response.status, 200);
  const etag = response.headers.get('ETag');
  assert(etag);
  const catalogue = parsePublicCatalogue(await response.json());
  const expected = await createLibraryRepository(env).listPublished({ includeFixtures: true, limit: 100 });
  assert(catalogue.libraries.length > 100, 'The feed must include every published record.');
  assert.deepEqual(catalogue.libraries.slice(0, 100), expected);
  assert.equal((await handleCatalogueRequest(request(etag), env, { includeFixtures: true })).status, 304);
  const params = new URLSearchParams('cards=uwa&offset=10&start=2026-10-12T14:00');
  const parsed = catalogueSearchRequest(catalogue, params, Date.parse('2026-10-12T06:00Z'));
  assert.equal(searchLibraries(catalogue.libraries, parsed).results.length, 10);
  const normal = await handleCatalogueRequest(request(), env);
  assert.equal(parsePublicCatalogue(await normal.json()).libraries.length, 0);
  await createLibraryRepository(env).unpublish(scaled[0].id);
  const changed = await handleCatalogueRequest(request(etag), env, { includeFixtures: true });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('ETag'), etag);
  assert(!parsePublicCatalogue(await changed.json()).libraries.some((library) => library.id === scaled[0].id));
  return Response.json({ catalogue: 'passed', records: catalogue.libraries.length, versionChecks: 'passed', publication: 'passed' });
};
