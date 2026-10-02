const restrictiveFields = ['institutions', 'open24Hours', 'usableWifi', 'quietStudy', 'groupStudy', 'wheelchairAccess', 'start', 'end', 'offset', 'limit'];

export function updateFinderParam(params: URLSearchParams, field: string, value: string | null) {
  const next = new URLSearchParams(params);
  if (value === null || value === '') next.delete(field); else next.set(field, value);
  if (field !== 'offset') next.delete('offset');
  return next;
}
export function toggleFinderSelection(params: URLSearchParams, field: 'cards' | 'institutions', value: string) {
  const selected = (params.get(field) ?? '').split(',').filter(Boolean);
  const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
  return updateFinderParam(params, field, next.join(','));
}
export function resetFinderFilters(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  restrictiveFields.forEach((field) => next.delete(field));
  return next;
}
export function finderUrl(params: URLSearchParams, path = '/') {
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}`;
}
