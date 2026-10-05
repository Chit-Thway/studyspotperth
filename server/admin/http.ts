import { evaluateLibrary } from '../../src/domain/library-search';
import { SearchValidationError, isInstitution } from '../../src/domain/search-request';
import { authTrustedOrigins } from '../auth/create-auth';
import { AccountError, requireAdmin } from '../account/session';
import { createLibrarySearchService } from '../libraries/search-service';
import { createAdminRepository } from './repository';

async function body(request: Request, fields: string[]) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AccountError(415, 'Use a JSON request.');
  const reader = request.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) throw new AccountError(400, 'Supply library information.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.length;
    if (size > 128 * 1024) { await reader.cancel(); throw new AccountError(413, 'Library information is too large.'); }
    chunks.push(chunk.value);
  }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new AccountError(400, 'Supply valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) throw new AccountError(400, 'Unsupported library field.');
  return value as Record<string, unknown>;
}
function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new AccountError(400, 'Invalid record or revision.');
  return value;
}
export async function handleAdminRequest(request: Request, env: Env, route: 'libraries' | 'library' | 'preview' | 'publish' | 'unpublish', id?: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const send = (value: unknown, status = 200) => Response.json(value, { status, headers });
  const methods = route === 'libraries' ? ['GET', 'POST'] : route === 'library' ? ['GET', 'PUT'] : ['POST'];
  if (!methods.includes(request.method)) { headers.set('Allow', methods.join(', ')); return send({ message: 'Method not allowed.' }, 405); }
  try {
    const admin = await requireAdmin(request, env);
    for (const cookie of admin.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
    if (request.method !== 'GET' && !authTrustedOrigins(env).includes(request.headers.get('origin') ?? '')) throw new AccountError(403, 'Request origin is not allowed.');
    const params = new URL(request.url).searchParams;
    if (route !== 'preview' && !(route === 'libraries' && request.method === 'GET') && params.size) throw new AccountError(400, 'Unsupported query parameter.');
    const repository = createAdminRepository(env);
    if (route === 'libraries') {
      if (request.method === 'GET') {
        if ([...params.keys()].some((key) => key !== 'after') || params.getAll('after').length > 1) throw new AccountError(400, 'Unsupported query parameter.');
        const after = params.get('after') ?? '';
        if (after && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(after)) throw new AccountError(400, 'Invalid page cursor.');
        return send(await repository.list(after));
      }
      const input = await body(request, ['slug', 'institution', 'content']);
      if (typeof input.slug !== 'string' || input.slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new AccountError(400, 'Use lowercase letters, numbers and hyphens for the slug.');
      if (typeof input.institution !== 'string' || !isInstitution(input.institution)) throw new AccountError(400, 'Select an institution.');
      return send(await repository.create(input.slug, input.institution, input.content), 201);
    }
    const libraryId = identifier(id);
    if (route === 'library') {
      if (request.method === 'GET') return send(await repository.get(libraryId));
      const input = await body(request, ['baseRevisionId', 'content']);
      return send(await repository.save(libraryId, identifier(input.baseRevisionId), input.content));
    }
    if (route === 'preview') {
      const current = await repository.get(libraryId);
      const input = await body(request, ['content']);
      const content = await repository.validate(input.content);
      const parsed = await createLibrarySearchService(env).request(params, Date.now());
      return send({ result: evaluateLibrary({ ...current.record, status: 'draft', content }, parsed), request: parsed, timeZone: 'Australia/Perth' });
    }
    const input = await body(request, ['revisionId']);
    return send(await repository[route](libraryId, identifier(input.revisionId)));
  } catch (error) {
    if (error instanceof AccountError || error instanceof SearchValidationError) return send({ message: error.message }, error instanceof AccountError ? error.status : 400);
    console.error(JSON.stringify({ event: 'admin_request_failed', route }));
    return send({ message: 'Library administration is temporarily unavailable. Please try again.' }, 503);
  }
}
