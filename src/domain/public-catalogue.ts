import type { LibraryRecord } from './library';
import { parseLibraryContent } from './parse-library';
import { isInstitution, DEFAULT_ORIGIN, parseSearchRequest, SearchValidationError, type SearchOrigin } from './search-request';
import { locationHeader, locationOrigin, type Coordinates } from './location';

export interface PublicCatalogue { schemaVersion: 1; libraries: LibraryRecord[]; origins: SearchOrigin[] }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalogue document.');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 200) throw new Error('Invalid catalogue identifier.');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid catalogue list.');
  return value as unknown[];
}

/** Validate once on download; search reuses this canonical public snapshot. */
export function parsePublicCatalogue(value: unknown): PublicCatalogue {
  const document = object(value);
  if (document.schemaVersion !== 1) throw new Error('Unsupported catalogue version.');
  const libraries = array(document.libraries).map((input): LibraryRecord => {
    const row = object(input);
    const slug = identifier(row.slug);
    if (slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || row.status !== 'published'
      || typeof row.institution !== 'string' || !isInstitution(row.institution) || typeof row.isFixture !== 'boolean') throw new Error('Invalid published library.');
    return { id: identifier(row.id), slug, institution: row.institution, isFixture: row.isFixture,
      revisionId: identifier(row.revisionId), status: 'published', content: parseLibraryContent(row.content) };
  });
  if (new Set(libraries.map((library) => library.id)).size !== libraries.length
    || new Set(libraries.map((library) => library.slug)).size !== libraries.length) throw new Error('Duplicate catalogue library.');
  const suburbs = array(document.origins).map((input): SearchOrigin => {
    const row = object(input);
    if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number' || !Number.isFinite(row.latitude)
      || !Number.isFinite(row.longitude) || Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180) throw new Error('Invalid catalogue origin.');
    return { id: identifier(row.id), name: identifier(row.name), latitude: row.latitude, longitude: row.longitude };
  });
  return { schemaVersion: 1, libraries, origins: [DEFAULT_ORIGIN, ...suburbs.filter((suburb) => suburb.id !== DEFAULT_ORIGIN.id)] };
}

export function catalogueSearchRequest(catalogue: PublicCatalogue, params: URLSearchParams, clock: number, coordinates?: Coordinates | null) {
  const device = locationOrigin(locationHeader(coordinates));
  const parsed = parseSearchRequest(params, clock, device ?? DEFAULT_ORIGIN);
  if (device || !params.has('suburb') || params.get('suburb') === DEFAULT_ORIGIN.id) return parsed;
  const origin = catalogue.origins.find((suburb) => suburb.id === params.get('suburb'));
  if (!origin) throw new SearchValidationError('suburb', 'This suburb is unavailable. Select an available suburb.');
  return { ...parsed, origin };
}
