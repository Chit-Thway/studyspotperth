export function savedQuery(effective: URLSearchParams) {
  const params = new URLSearchParams();
  for (const [field, value] of effective) if (['cards', 'suburb', 'start'].includes(field)) params.append(field, value);
  return { params, refreshNow: !params.has('start') };
}
