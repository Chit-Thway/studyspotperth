import { parsePreferences } from '../../src/domain/account';
import { evaluateLibrary } from '../../src/domain/library-search';
import { SearchValidationError } from '../../src/domain/search-request';
import { authTrustedOrigins } from '../auth/create-auth';
import { createLibrarySearchService } from '../libraries/search-service';
import { createAccountRepository } from './repository';
import { AccountError, accountSession } from './session';
import { LOCATION_HEADER, locationOrigin } from '../../src/domain/location';

async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AccountError(415, 'Use a JSON request.');
  const reader = request.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) throw new AccountError(400, 'Supply preferences.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); throw new AccountError(413, 'Preferences are too large.'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(buffer)) as unknown; } catch { throw new AccountError(400, 'Supply valid JSON.'); }
}

async function requireEmptyBody(request: Request) {
  const reader = request.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) return;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return;
    if (chunk.value.length) { await reader.cancel(); throw new AccountError(400, 'This endpoint does not accept a request body.'); }
  }
}

export async function handleAccountRequest(request: Request, env: Env, route: 'profile' | 'saved' | 'favourite', libraryId?: string, options: { includeFixtures?: boolean } = {}): Promise<Response> {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const send = (body: unknown, status = 200) => Response.json(body, { status, headers });
  const methods = route === 'profile' ? ['GET', 'PUT'] : route === 'saved' ? ['GET'] : ['PUT', 'DELETE'];
  if (!methods.includes(request.method)) { headers.set('Allow', methods.join(', ')); return send({ message: 'Method not allowed.' }, 405); }
  try {
    const params = new URL(request.url).searchParams;
    if (route !== 'saved' && params.size) throw new AccountError(400, 'This endpoint does not accept query parameters.');
    if (request.method !== 'GET' && !authTrustedOrigins(env).includes(request.headers.get('origin') ?? '')) throw new AccountError(403, 'Request origin is not allowed.');
    const result = await accountSession(request, env);
    for (const cookie of result.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
    const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    if (!result.session) {
      if (route === 'profile' && request.method === 'GET') return send({ account: null, googleEnabled });
      throw new AccountError(401, 'Sign in to continue.');
    }
    const user = result.session.user;
    const repository = createAccountRepository(env, options);
    if (route === 'profile') {
      if (request.method === 'PUT') {
        let preferences;
        try { preferences = parsePreferences(await jsonBody(request)); } catch (error) {
          if (error instanceof AccountError) throw error;
          throw new AccountError(400, error instanceof Error ? error.message : 'Invalid preferences.');
        }
        await repository.savePreferences(user.id, preferences);
      }
      return send({ account: await repository.profile(user), googleEnabled });
    }
    if (route === 'favourite') {
      if (!libraryId || libraryId.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(libraryId)) throw new AccountError(400, 'Invalid library.');
      await requireEmptyBody(request);
      await repository.favourite(user.id, libraryId, request.method === 'PUT');
      return send({ account: await repository.profile(user), googleEnabled });
    }
    const parsed = await createLibrarySearchService(env, options).request(params, Date.now(), locationOrigin(request.headers.get(LOCATION_HEADER)));
    // Saved libraries stay visible even when closed or outside the finder filters.
    return send({ results: (await repository.saved(user.id)).map((record) => evaluateLibrary(record, parsed)) });
  } catch (error) {
    if (error instanceof AccountError || error instanceof SearchValidationError) return send({ message: error.message }, error instanceof AccountError ? error.status : 400);
    console.error(JSON.stringify({ event: 'account_request_failed', route }));
    return send({ message: 'Account information is temporarily unavailable. Please try again.' }, 503);
  }
}
