import type { LibrarySearchResult, searchLibraries } from '../../domain/library-search';
import type { SearchOrigin, SearchRequest } from '../../domain/search-request';

export type SearchResponse = ReturnType<typeof searchLibraries> & { request: SearchRequest; timeZone: 'Australia/Perth' };
export interface DetailResponse { result: LibrarySearchResult; request: SearchRequest; timeZone: 'Australia/Perth' }
export interface OriginsResponse { origins: SearchOrigin[]; defaultOriginId: string }
export class LibraryApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly field?: string) { super(message); }
}

/** The server owns the validated result contract. Errors stay readable in the UI. */
export async function readLibraryApi<T>(url: string, signal: AbortSignal, deviceLocation: string | null = null): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json', ...(deviceLocation ? { 'X-StudySpot-Location': deviceLocation } : {}) } });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = payload && typeof payload === 'object' ? payload : {};
    throw new LibraryApiError(response.status, 'message' in error && typeof error.message === 'string'
      ? error.message : 'Library information is temporarily unavailable.',
    'field' in error && typeof error.field === 'string' ? error.field : undefined);
  }
  if (!payload || typeof payload !== 'object') throw new Error('Unexpected library response. Please try again.');
  return payload as T;
}
