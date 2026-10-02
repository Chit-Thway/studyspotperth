import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { createDatabase } from '../../server/db/client';
import * as authSchema from '../../server/db/auth-schema';
import * as librarySchema from '../../server/db/library-schema';
import { createLibraryRepository } from '../../server/libraries/repository';
import { libraryFixtures } from '../../tests/fixtures/libraries';

/** Installed only in the isolated verification server, never in app Functions. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const repository = createLibraryRepository(env);
  const database = createDatabase(env);
  for (const table of [...Object.values(authSchema), ...Object.values(librarySchema)]) {
    const metadata = getTableConfig(table);
    const columns = await env.DB.prepare(`PRAGMA table_info("${metadata.name}")`).all<{ name: string }>();
    assert.deepEqual(columns.results.map((column) => column.name).sort(), metadata.columns.map((column) => column.name).sort(), `Schema mismatch for ${metadata.name}`);
  }
  assert.deepEqual(await repository.listPublished(), []);
  const visibleFixtures = await repository.listPublished({ includeFixtures: true });
  assert.equal(visibleFixtures.length, libraryFixtures.length);
  for (const fixture of libraryFixtures) {
    assert.equal(await repository.getPublishedBySlug(fixture.slug), null);
    const record = await repository.getPublishedBySlug(fixture.slug, { includeFixtures: true });
    assert.deepEqual(record?.content, fixture.content);
    assert.equal(record?.isFixture, true);
  }
  const page = await repository.listPublished({ includeFixtures: true, limit: 3 });
  const next = await repository.listPublished({ includeFixtures: true, limit: 3, afterSlug: page[2].slug });
  assert.equal(new Set([...page, ...next].map((record) => record.slug)).size, 6);

  const fixture = libraryFixtures[0];
  const draftContent = { ...fixture.content, name: 'Fictional Edited Day Library', privateAdminNote: 'Must not enter public content' };
  const draftId = await repository.createDraft(fixture.id, draftContent);
  assert.equal((await repository.getPublishedBySlug(fixture.slug, { includeFixtures: true }))?.content.name, fixture.content.name);
  const draft = await repository.getLatestDraft(fixture.id);
  assert.equal(draft?.content.name, draftContent.name);
  assert(!Object.hasOwn(draft.content, 'privateAdminNote'));
  await repository.publishDraft(draftId);
  assert.equal((await repository.getPublishedBySlug(fixture.slug, { includeFixtures: true }))?.revisionId, draftId);
  await assert.rejects(() => repository.publishDraft(`${fixture.id}-published`), /Draft not found/);
  assert.equal((await repository.getPublishedBySlug(fixture.slug, { includeFixtures: true }))?.revisionId, draftId);
  await assert.rejects(() => env.DB.prepare('UPDATE library_revision SET content = ? WHERE id = ?').bind('{}', draftId).run(), /immutable/);
  const active = await env.DB.prepare("SELECT count(*) AS count FROM library_revision WHERE library_id = ? AND status = 'published'").bind(fixture.id).first<{ count: number }>();
  assert.equal(active?.count, 1);
  await assert.rejects(() => env.DB.prepare("INSERT INTO library_revision (id,library_id,status,content,created_at,published_at) SELECT 'duplicate-published',library_id,'published',content,created_at,published_at FROM library_revision WHERE id = ?")
    .bind(draftId).run(), /UNIQUE/);
  await assert.rejects(() => env.DB.prepare("INSERT INTO library_revision (id,library_id,status,content,created_at) VALUES ('invalid-json',?,'draft','not-json',0)").bind(fixture.id).run());
  await repository.unpublish(fixture.id);
  assert.equal(await repository.getPublishedBySlug(fixture.slug, { includeFixtures: true }), null);

  const created = await repository.createLibrary({ slug: 'fictional-draft-only', institution: 'public', isFixture: true }, fixture.content);
  assert.equal(await repository.getPublishedBySlug('fictional-draft-only', { includeFixtures: true }), null);
  assert.equal((await repository.getLatestDraft(created.libraryId))?.revisionId, created.revisionId);
  await repository.publishDraft(created.revisionId);
  assert.equal((await repository.getPublishedBySlug('fictional-draft-only', { includeFixtures: true }))?.revisionId, created.revisionId);
  await assert.rejects(() => repository.createLibrary({ slug: 'fictional-draft-only', institution: 'public', isFixture: true }, fixture.content));
  await assert.rejects(() => repository.createLibrary({ slug: 'fixture-as-real', institution: 'public' }, fixture.content), /Fictional data/);
  const undated = structuredClone(fixture.content);
  undated.name = 'Unverified test record';
  undated.suburbId = null;
  undated.sources[0] = { ...undated.sources[0], kind: 'official', url: 'https://example.invalid/unverified' };
  const unverified = await repository.createLibrary({ slug: 'unverified-test-record', institution: 'public' }, undated);
  await assert.rejects(() => repository.publishDraft(unverified.revisionId), /dated sources/);
  assert.equal(await repository.getPublishedBySlug('unverified-test-record'), null);
  await assert.rejects(() => env.DB.prepare("INSERT INTO suburb (id,name,latitude,longitude) VALUES ('unsourced','Unsourced origin',-31.95,115.86)").run(), /CHECK/);

  assert.equal((await database.select().from(librarySchema.userCards).where(eq(librarySchema.userCards.userId, 'fixture-user')).all())[0].institutionId, 'uwa');
  assert.equal((await database.select().from(librarySchema.userPreferences).get())?.suburbId, 'fixture-cbd');
  assert.equal((await database.select().from(librarySchema.favourites).get())?.libraryId, fixture.id);
  assert.equal((await database.select().from(librarySchema.userRoles).get())?.role, 'user');
  assert.equal((await database.select().from(authSchema.user).get())?.createdAt.getTime(), 1_790_812_800_000);
  for (const table of [authSchema.session, authSchema.account, authSchema.verification]) await database.select().from(table).all();
  await assert.rejects(() => env.DB.prepare("INSERT INTO user_card (user_id,institution_id) VALUES ('fixture-user','public')").run(), /CHECK/);
  await assert.rejects(() => env.DB.prepare("INSERT INTO favourite (user_id,library_id) VALUES ('missing-user','fixture-uwa')").run(), /FOREIGN KEY/);
  await assert.rejects(() => env.DB.prepare("INSERT INTO user_preferences (user_id,suburb_id) VALUES ('missing-user','missing-suburb')").run(), /FOREIGN KEY/);
  await assert.rejects(() => env.DB.batch([
    env.DB.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES ('rollback-user','Fictional rollback user','rollback@example.invalid',0,0)"),
    env.DB.prepare("INSERT INTO favourite (user_id,library_id) VALUES ('rollback-user','missing-library')"),
  ]), /FOREIGN KEY/);
  assert.equal(await env.DB.prepare("SELECT id FROM user WHERE id = 'rollback-user'").first(), null);
  const foreignKeys = await env.DB.prepare('PRAGMA foreign_key_check').all();
  assert.equal(foreignKeys.results.length, 0);
  return Response.json({ status: 'ok', fixtureCount: libraryFixtures.length, checks: ['schema', 'fixtures', 'publication', 'provenance', 'immutability', 'profiles', 'foreign-keys', 'atomic-rollback'] });
};
