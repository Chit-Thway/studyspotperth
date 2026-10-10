import { parsePublicCatalogue, type PublicCatalogue } from '../../domain/public-catalogue';
import { LibraryApiError } from './api';

export interface CatalogueSnapshot { etag: string | null; catalogue: PublicCatalogue }

export async function readPublicCatalogue(previous: CatalogueSnapshot | null, signal: AbortSignal): Promise<CatalogueSnapshot> {
  const response = await fetch('/api/catalogue', { signal, credentials: 'omit', cache: 'no-store',
    headers: { Accept: 'application/json', ...(previous?.etag ? { 'If-None-Match': previous.etag } : {}) } });
  if (response.status === 304 && previous) return previous;
  if (!response.ok) throw new LibraryApiError(response.status, 'Library information couldn’t load. Check your connection and try again.');
  const catalogue = parsePublicCatalogue(await response.json());
  return { etag: response.headers.get('ETag'), catalogue };
}
