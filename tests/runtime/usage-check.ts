import assert from 'node:assert/strict';
import { handleUsageRequest } from '../../server/usage/http';
import { formatPerthTime, shiftDate } from '../../src/domain/perth-time';
import type { UsageSummary } from '../../src/domain/privacy';

/** Runs only against the disposable verification database. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const origin = new URL(env.AUTH_BASE_URL).origin;
  const today = formatPerthTime(Date.now()).slice(0, 10);
  const consent = `studyspot_consent=v1-accepted; studyspot_visitor=${crypto.randomUUID()}`;
  async function session(id: string) {
    const now = Date.now();
    await env.DB.prepare('INSERT INTO user(id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)').bind(id, 'Synthetic usage test', `${id}@example.invalid`, now, now).run();
    const token = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), now + 86400000, token, now, now, id).run();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)));
    return `better-auth.session_token=${encodeURIComponent(`${token}.${btoa(String.fromCharCode(...signature))}`)}`;
  }
  const account = await session('usage-check-user');
  const admin = await session('usage-check-admin');
  await env.DB.prepare("INSERT INTO user_role(user_id,role) VALUES ('usage-check-admin','admin')").run();
  const event = (type = 'visit') => ({ id: crypto.randomUUID(), type });
  const call = (body: unknown, cookie = consent, requestOrigin = origin, method = 'POST') => handleUsageRequest(new Request(`${origin}/api/usage`, {
    method, headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body),
  }), env);
  const stats = (cookie = admin) => handleUsageRequest(new Request(`${origin}/api/admin/usage`, { headers: { Cookie: cookie } }), env, true);
  const visits = () => env.DB.prepare('SELECT count(*) AS count FROM usage_visit').first<{ count: number }>();
  for (const cookie of ['', 'studyspot_consent=v1-essential', `studyspot_visitor=${crypto.randomUUID()}`,
    `studyspot_consent=v0-accepted; studyspot_visitor=${crypto.randomUUID()}`]) assert.equal((await call(event(), cookie)).status, 204);
  assert.equal((await visits())?.count, 0, 'No optional tracking before acceptance.');
  assert.equal((await call(event(), consent, 'https://evil.invalid')).status, 403);
  assert.equal((await call(event(), consent, origin, 'GET')).status, 405);
  for (const value of [{ ...event(), latitude: -31.9 }, { ...event(), userId: 'chosen-account' }, { id: 'bad', type: 'visit' }, { ...event(), type: ['visit'] }]) assert.equal((await call(value)).status, 400);
  assert.equal((await call({ padding: 'x'.repeat(1000) })).status, 413);
  const sameVisit = event();
  const responses = await Promise.all(Array.from({ length: 6 }, () => call(sameVisit)));
  assert(responses.every((response) => response.status === 204));
  assert.equal((await visits())?.count, 1, 'Reloads and concurrent duplicate visits must count once per day.');
  const anonymousHash = await env.DB.prepare("SELECT actor_hash AS hash FROM usage_visit WHERE actor_kind='anonymous'").first<{ hash: string }>();
  assert(anonymousHash && anonymousHash.hash.length === 64);
  assert(!consent.includes(anonymousHash.hash), 'Raw visitor identifiers are not stored.');
  await env.DB.prepare('INSERT INTO usage_visit(actor_kind,actor_hash,day) VALUES (?,?,?)').bind('anonymous', anonymousHash.hash, shiftDate(today, -40)).run();
  await env.DB.prepare('INSERT INTO usage_visit(actor_kind,actor_hash,day) VALUES (?,?,?)').bind('anonymous', 'expired-record', shiftDate(today, -100)).run();
  assert.equal((await call(event(), `${consent}; ${account}`)).status, 204);
  assert.equal((await call(event(), `${consent}; ${account}`)).status, 204);
  assert.equal((await call(event(), `studyspot_consent=v1-accepted; studyspot_visitor=${crypto.randomUUID()}; ${account}`)).status, 204);
  const library = await env.DB.prepare("SELECT l.id FROM library l INNER JOIN library_revision r ON r.library_id=l.id AND r.status='published' WHERE l.is_fixture=0 LIMIT 1").first<{ id: string }>();
  assert(library);
  const directions = { ...event('directions'), libraryId: library.id };
  assert.equal((await call(directions)).status, 204);
  assert.equal((await call(directions)).status, 204);
  assert.equal((await call({ ...directions, id: crypto.randomUUID() })).status, 204);
  assert.equal((await call({ ...directions, libraryId: 'fixture-uwa' })).status, 404);
  assert.equal((await stats('')).status, 401);
  assert.equal((await stats(account)).status, 403);
  const response = await stats();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const summary = await response.json<UsageSummary>();
  assert.deepEqual(summary.actors, [{ kind: 'account', active: 1, returning: 0 }, { kind: 'anonymous', active: 1, returning: 1 }]);
  assert.equal(summary.directionsClicks, 2, 'Event retry IDs must not duplicate directions clicks.');
  assert.equal(summary.from, shiftDate(today, -29));
  assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM usage_visit WHERE actor_hash='expired-record'").first<{ count: number }>())?.count, 0);
  const before = (await visits())?.count;
  assert.equal((await call(event(), `studyspot_consent=v1-essential; ${account}`)).status, 204);
  assert.equal((await visits())?.count, before, 'Consent refusal must also apply to signed-in users.');
  await env.DB.prepare("DELETE FROM user_role WHERE user_id='usage-check-admin'").run();
  assert.equal((await stats()).status, 403, 'Demoted administrators must lose access immediately.');
  return Response.json({ status: 'ok' });
};
