import assert from 'node:assert/strict';
import { handleAccountRequest } from '../../server/account/http';
import { createAuth } from '../../server/auth/create-auth';
import { requireAdmin, AccountError } from '../../server/account/session';
import { libraryFixtures } from '../../tests/fixtures/libraries';
import type { AccountResponse } from '../../src/domain/account';
import type { LibrarySearchResult } from '../../src/domain/library-search';

/** Installed only in the disposable local verification runtime. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const origin = new URL(env.AUTH_BASE_URL).origin;
  const now = Date.now();
  const unconfigured = { ...env, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
  const guest = await handleAccountRequest(new Request(`${origin}/api/account`), unconfigured, 'profile');
  assert.deepEqual(await guest.json(), { account: null, googleEnabled: false });
  const disabledSignIn = await createAuth(unconfigured).handler(new Request(`${origin}/api/auth/sign-in/social`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'google', callbackURL: `${origin}/profile`, disableRedirect: true }),
  }));
  assert.equal(disabledSignIn.status, 404);
  async function testSession(id: string, expiresAt = now + 7 * 86400000, updatedAt = now) {
    await env.DB.prepare('INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING').bind(id, `Test ${id}`, `${id}@example.invalid`, now, now).run();
    const token = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), expiresAt, token, updatedAt, updatedAt, id).run();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)));
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${btoa(String.fromCharCode(...signature))}`)}`;
    return { cookie, token };
  }
  const alice = await testSession('account-check-alice');
  const bob = await testSession('account-check-bob');
  const call = (cookie: string, route: 'profile' | 'saved' | 'favourite' = 'profile', method = 'GET', body?: unknown, id?: string, requestOrigin = origin, query = '') => {
    const headers = new Headers({ Origin: requestOrigin });
    if (cookie) headers.set('Cookie', cookie);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    return handleAccountRequest(new Request(`${origin}/api/account${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, route, id, { includeFixtures: true });
  };
  const profile = async (cookie: string) => (await call(cookie)).json<AccountResponse>();
  assert.equal((await profile('')).account, null);
  assert.equal((await call('', 'profile', 'PUT', { suburbId: null, cards: ['uwa'] })).status, 401);
  assert.equal((await call('', 'saved')).status, 401);
  assert.equal((await call('', 'favourite', 'PUT', undefined, libraryFixtures[0].id)).status, 401);
  assert.equal((await call(alice.cookie, 'profile', 'PUT', { suburbId: null, cards: ['uwa'] })).status, 200);
  assert.deepEqual((await profile(alice.cookie)).account?.preferences, { suburbId: null, cards: ['uwa'] });
  assert.deepEqual((await profile(bob.cookie)).account?.preferences.cards, []);
  await env.DB.prepare('INSERT INTO suburb(id,name,latitude,longitude,source_url,checked_on,is_fixture) VALUES (?,?,?,?,?,?,0)').bind('account-check-origin', 'Synthetic account test origin', -31.95, 115.86, 'https://example.invalid/test-origin', '2026-10-03').run();
  assert.equal((await call(alice.cookie, 'profile', 'PUT', { suburbId: 'account-check-origin', cards: ['uwa'] })).status, 200);
  assert.equal((await profile(alice.cookie)).account?.preferences.suburbId, 'account-check-origin');
  await env.DB.prepare('DELETE FROM suburb WHERE id = ?').bind('account-check-origin').run();
  assert.equal((await profile(alice.cookie)).account?.preferences.suburbId, null);
  const secondAliceSession = await testSession('account-check-alice');
  assert.deepEqual((await profile(secondAliceSession.cookie)).account?.preferences.cards, ['uwa']);
  for (const body of [{ suburbId: null, cards: [], userId: 'account-check-bob' }, { suburbId: null, cards: [], role: 'admin' }, { suburbId: null, cards: ['public'] }, { suburbId: 'fixture-cbd', cards: [] }]) assert.equal((await call(alice.cookie, 'profile', 'PUT', body)).status, 400);
  assert.equal((await call(alice.cookie, 'profile', 'PUT', { suburbId: null, cards: [] }, undefined, 'https://evil.invalid')).status, 403);
  assert.equal((await call(alice.cookie, 'profile', 'PUT', { suburbId: null, cards: [] }, undefined, '')).status, 403);
  assert.equal((await call(alice.cookie, 'profile', 'GET', undefined, undefined, origin, '?userId=account-check-bob')).status, 400);
  const libraryId = libraryFixtures[0].id;
  assert.equal((await call(alice.cookie, 'favourite', 'PUT', undefined, libraryId)).status, 200);
  assert.equal((await call(alice.cookie, 'favourite', 'PUT', undefined, libraryId)).status, 200);
  assert.deepEqual((await profile(alice.cookie)).account?.favouriteIds, [libraryId]);
  assert.deepEqual((await profile(bob.cookie)).account?.favouriteIds, []);
  assert.equal((await call(bob.cookie, 'favourite', 'DELETE', undefined, libraryId)).status, 200);
  assert.deepEqual((await profile(alice.cookie)).account?.favouriteIds, [libraryId]);
  const saved = await call(alice.cookie, 'saved', 'GET', undefined, undefined, origin, '?start=2026-10-02T23:00&institutions=uwa&open24Hours=true');
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json<{ results: LibrarySearchResult[] }>();
  assert.equal(savedPayload.results.length, 1, 'Saved libraries must not disappear under finder restrictions.');
  assert.equal(savedPayload.results[0].library.id, libraryId);
  assert.equal(savedPayload.results[0].opening.status, 'closed', 'Closed saved libraries must remain visible.');
  const sessionSaved = await call(alice.cookie, 'saved', 'GET', undefined, undefined, origin,
    '?start=2026-10-02T14:00&end=2026-10-02T16:00&institutions=uwa&open24Hours=true');
  assert.equal(sessionSaved.status, 200);
  const sessionPayload = await sessionSaved.json<{ results: LibrarySearchResult[] }>();
  assert.equal(sessionPayload.results.length, 1, 'Finder restrictions must not remove saved records from the selected session.');
  assert.equal(sessionPayload.results[0].evaluatedAt, '2026-10-02T14:00:00+08:00');
  assert.equal(sessionPayload.results[0].coverage.status, 'covered');
  const publicSaved = await handleAccountRequest(new Request(`${origin}/api/account/favourites`, { headers: { Cookie: alice.cookie } }), env, 'saved');
  assert.deepEqual(await publicSaved.json(), { results: [] }, 'Public account routes must also exclude fictional records.');
  assert.equal((await call(alice.cookie, 'favourite', 'PUT', undefined, 'missing-library')).status, 404);
  assert.equal((await call(alice.cookie, 'favourite', 'PUT', { userId: 'account-check-bob' }, libraryId)).status, 400);
  assert.equal((await call(alice.cookie, 'favourite', 'DELETE', undefined, libraryId)).status, 200);
  assert.deepEqual((await profile(alice.cookie)).account?.favouriteIds, []);
  const expired = await testSession('account-check-expired', now - 1000);
  assert.equal((await profile(expired.cookie)).account, null);
  assert.equal((await profile(`${alice.cookie}tampered`)).account, null);
  await env.DB.prepare('DELETE FROM session WHERE token = ?').bind(bob.token).run();
  assert.equal((await profile(bob.cookie)).account, null);
  const refreshable = await testSession('account-check-alice', now + 5 * 86400000, now - 2 * 86400000);
  assert.match((await call(refreshable.cookie)).headers.get('set-cookie') ?? '', /better-auth.session_token=/, 'Session renewal cookies must reach the browser.');
  const adminRequest = new Request(`${origin}/api/account`, { headers: { Cookie: alice.cookie } });
  await assert.rejects(requireAdmin(adminRequest, env), (error) => error instanceof AccountError && error.status === 403);
  await env.DB.prepare("INSERT INTO user_role(user_id,role) VALUES (?,'admin') ON CONFLICT(user_id) DO UPDATE SET role='admin'").bind('account-check-alice').run();
  assert.equal((await requireAdmin(adminRequest, env)).userId, 'account-check-alice');
  await env.DB.prepare("UPDATE user_role SET role='user' WHERE user_id=?").bind('account-check-alice').run();
  await assert.rejects(requireAdmin(adminRequest, env), (error) => error instanceof AccountError && error.status === 403);
  const signOut = await createAuth(env).handler(new Request(`${origin}/api/auth/sign-out`, { method: 'POST', headers: { Cookie: alice.cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(signOut.status, 200);
  assert.equal((await profile(alice.cookie)).account, null);
  assert((await profile(secondAliceSession.cookie)).account, 'Sign-out revokes the current session, not every device.');
  return Response.json({ ok: true, checks: 'session signatures/expiry/revocation/renewal, ownership, preferences, favourites, CSRF, fixture exclusion and server roles' }, { headers: { 'Set-Cookie': `${secondAliceSession.cookie}; HttpOnly; Path=/; SameSite=Lax` } });
};
