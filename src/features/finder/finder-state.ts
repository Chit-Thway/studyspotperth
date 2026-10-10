import { FINDER_PAGE_SIZE, FINDER_QUERY_FIELDS, normalizeSearchParams } from '../../domain/search-request';

/** The finder always shows ten cards; invalid query values still reach shared validation. */
export function finderRequestParams(params: URLSearchParams) {
  const next = normalizeSearchParams(params);
  const limits = next.getAll('limit');
  if (!limits.length || limits.length === 1 && /^\d+$/.test(limits[0]) && Number(limits[0]) >= 1 && Number(limits[0]) <= 100) {
    next.set('limit', FINDER_PAGE_SIZE.toString());
  }
  return next;
}

const restrictiveFields = ['institutions', 'sizes', 'publicAccess', 'open24Hours', 'usableWifi', 'quietStudy', 'groupStudy', 'wheelchairAccess', 'start', 'offset', 'limit'];

/** Carry finder selections across public pages, excluding route-specific state.
 * Keep values and duplicates intact so shared search validation remains authoritative.
 */
function publicFinderParams(params: URLSearchParams) {
  return new URLSearchParams([...normalizeSearchParams(params)].filter(([field]) => FINDER_QUERY_FIELDS.includes(field)));
}

export function updateFinderParam(params: URLSearchParams, field: string, value: string | null) {
  const next = normalizeSearchParams(params);
  if (value === null || value === '') next.delete(field); else next.set(field, value);
  if (field !== 'offset') next.delete('offset');
  return next;
}
export function toggleFinderSelection(params: URLSearchParams, field: 'cards' | 'institutions' | 'sizes', value: string) {
  const selected = (normalizeSearchParams(params).get(field) ?? '').split(',').filter(Boolean);
  const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
  const updated = updateFinderParam(params, field, next.join(','));
  if (field === 'cards' && !next.length) updated.set('cards', '');
  return updated;
}
export function resetFinderFilters(params: URLSearchParams) {
  const next = publicFinderParams(params);
  restrictiveFields.forEach((field) => next.delete(field));
  return next;
}
export function finderUrl(params: URLSearchParams, path = '/') {
  return queryUrl(publicFinderParams(params), path);
}
/** Preserve validation of active parameters while discarding retired departure times. */
export function queryUrl(params: URLSearchParams, path: string) {
  const query = normalizeSearchParams(params).toString();
  return `${path}${query ? `?${query}` : ''}`;
}
