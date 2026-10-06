import { SearchValidationError } from '../../src/domain/search-request';
import { createLibrarySearchService } from './search-service';
import { LOCATION_HEADER, locationOrigin } from '../../src/domain/location';

type LibraryRoute = 'search' | 'detail' | 'suburbs';
export async function handleLibraryRequest(request: Request, env: Env, route: LibraryRoute, slug?: string,
  clock = Date.now(), options: { includeFixtures?: boolean } = {}): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'GET') return Response.json({ error: 'method_not_allowed', message: 'Use GET for library reads.' },
    { status: 405, headers: { ...headers, Allow: 'GET' } });
  try {
    const params = new URL(request.url).searchParams;
    const service = createLibrarySearchService(env, options);
    if (route === 'suburbs') {
      if (params.size) throw new SearchValidationError('query', 'The suburb list does not accept search parameters.');
      return Response.json({ origins: await service.origins(), defaultOriginId: 'perth-cbd' }, { headers });
    }
    const origin = locationOrigin(request.headers.get(LOCATION_HEADER));
    const result = route === 'search' ? await service.search(params, clock, origin) : await service.detail(slug ?? '', params, clock, origin);
    return result ? Response.json(result, { headers }) : Response.json({ error: 'library_not_found', message: 'This library is not available.' }, { status: 404, headers });
  } catch (error) {
    if (error instanceof SearchValidationError) return Response.json({ error: 'invalid_search', field: error.field, message: error.message }, { status: 400, headers });
    console.error(JSON.stringify({ event: 'library_read_failed', route }));
    return Response.json({ error: 'libraries_unavailable', message: 'Library information is temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
