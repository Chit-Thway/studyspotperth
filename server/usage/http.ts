import { visitorId, UUID_PATTERN, type UsageSummary } from '../../src/domain/privacy';
import { formatPerthTime, shiftDate } from '../../src/domain/perth-time';
import { authTrustedOrigins } from '../auth/create-auth';
import { AccountError, accountSession, requireAdmin } from '../account/session';

async function eventBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AccountError(415, 'Use JSON.');
  const reader = request.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) throw new AccountError(400, 'Supply an event.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 512) { await reader.cancel(); throw new AccountError(413, 'Event too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AccountError(400, 'Invalid event.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccountError(400, 'Invalid event.');
  const item = body as Record<string, unknown>;
  if (Object.keys(item).some((key) => !['id', 'type', 'libraryId'].includes(key)) || typeof item.id !== 'string' || !UUID_PATTERN.test(item.id)
    || (item.type !== 'visit' && item.type !== 'directions') || (item.type === 'visit' && 'libraryId' in item)
    || (item.type === 'directions' && (typeof item.libraryId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(item.libraryId)))) throw new AccountError(400, 'Invalid event.');
  return { id: item.id, type: item.type, libraryId: item.libraryId };
}
async function actorHash(secret: string, actor: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`usage:${actor}`)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function purge(env: Env, cutoff: string) {
  return [env.DB.prepare('DELETE FROM usage_visit WHERE day < ?').bind(cutoff), env.DB.prepare('DELETE FROM usage_directions WHERE day < ?').bind(cutoff)];
}

export async function handleUsageRequest(request: Request, env: Env, summary = false): Promise<Response> {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const send = (body: unknown, status = 200) => Response.json(body, { status, headers });
  const method = summary ? 'GET' : 'POST';
  if (request.method !== method) { headers.set('Allow', method); return send({ message: 'Method not allowed.' }, 405); }
  try {
    if (new URL(request.url).search) throw new AccountError(400, 'Query parameters are not supported.');
    const today = formatPerthTime(Date.now()).slice(0, 10);
    const cutoff = shiftDate(today, -89);
    if (summary) {
      const admin = await requireAdmin(request, env);
      for (const cookie of admin.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
      const from = shiftDate(today, -29);
      const results = await env.DB.batch([
        ...purge(env, cutoff),
        env.DB.prepare(`SELECT actor_kind AS kind, count(*) AS active, sum(CASE WHEN days > 1 THEN 1 ELSE 0 END) AS [returning]
          FROM (SELECT actor_kind,actor_hash,count(*) AS days,max(day) AS last_day FROM usage_visit WHERE day BETWEEN ? AND ? GROUP BY actor_kind,actor_hash)
          WHERE last_day >= ? GROUP BY actor_kind`).bind(cutoff, today, from),
        env.DB.prepare('SELECT count(*) AS count FROM usage_directions WHERE day BETWEEN ? AND ?').bind(from, today),
        env.DB.prepare('SELECT count(*) AS count FROM favourite f INNER JOIN library l ON l.id=f.library_id WHERE l.is_fixture=0'),
      ]);
      const rows = results[2].results as UsageSummary['actors'];
      const count = (index: number) => Number((results[index].results[0] as { count: number }).count);
      return send({ from, to: today, actors: (['account', 'anonymous'] as const).map((kind) => rows.find((row) => row.kind === kind) ?? { kind, active: 0, returning: 0 }), directionsClicks: count(3), favourites: count(4) } satisfies UsageSummary);
    }
    if (!authTrustedOrigins(env).includes(request.headers.get('origin') ?? '')) throw new AccountError(403, 'Request origin is not allowed.');
    const visitor = visitorId(request.headers.get('cookie') ?? '');
    if (!visitor) return new Response(null, { status: 204, headers });
    const event = await eventBody(request);
    const result = await accountSession(request, env);
    for (const cookie of result.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
    const kind = result.session ? 'account' : 'anonymous';
    const hash = await actorHash(env.AUTH_SECRET, `${kind}:${result.session?.user.id ?? visitor}`);
    if (event.type === 'directions') {
      if (!await env.DB.prepare("SELECT l.id FROM library l INNER JOIN library_revision r ON r.library_id=l.id AND r.status='published' WHERE l.id=? AND l.is_fixture=0").bind(event.libraryId).first()) throw new AccountError(404, 'Library not available.');
      const count = await env.DB.prepare('SELECT count(*) AS count FROM usage_directions WHERE actor_kind=? AND actor_hash=? AND day=?').bind(kind, hash, today).first<{ count: number }>();
      if ((count?.count ?? 0) >= 200) throw new AccountError(429, 'Daily event limit reached.');
    }
    await env.DB.batch([
      ...purge(env, cutoff),
      env.DB.prepare('INSERT INTO usage_visit(actor_kind,actor_hash,day) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(kind, hash, today),
      ...(event.type === 'directions' ? [env.DB.prepare('INSERT INTO usage_directions(id,actor_kind,actor_hash,day,library_id) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(event.id, kind, hash, today, event.libraryId)] : []),
    ]);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    if (error instanceof AccountError) return send({ message: error.message }, error.status);
    console.error(JSON.stringify({ event: 'usage_request_failed' }));
    return send({ message: 'Usage statistics are temporarily unavailable.' }, 503);
  }
}
