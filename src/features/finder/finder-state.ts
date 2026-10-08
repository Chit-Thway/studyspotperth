import { FINDER_QUERY_FIELDS, withoutEndTime } from '../../domain/search-request';

const restrictiveFields = ['institutions', 'open24Hours', 'usableWifi', 'quietStudy', 'groupStudy', 'wheelchairAccess', 'start', 'offset', 'limit'];

/** Carry finder selections across public pages, excluding route-specific state.
 * Keep values and duplicates intact so API validation remains authoritative.
 */
function publicFinderParams(params: URLSearchParams) {
  return new URLSearchParams([...params].filter(([field]) => FINDER_QUERY_FIELDS.includes(field)));
}

export function updateFinderParam(params: URLSearchParams, field: string, value: string | null) {
  const next = withoutEndTime(params);
  if (value === null || value === '') next.delete(field); else next.set(field, value);
  if (field !== 'offset') next.delete('offset');
  return next;
}
export function toggleFinderSelection(params: URLSearchParams, field: 'cards' | 'institutions', value: string) {
  const selected = (params.get(field) ?? '').split(',').filter(Boolean);
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
  const query = withoutEndTime(params).toString();
  return `${path}${query ? `?${query}` : ''}`;
}
