/** Publication validates immutable snapshots. D1 shapes the public document so
 * this read path never parses schedules or calculates personalised results. */
export async function handleCatalogueRequest(request: Request, env: Env, options: { includeFixtures?: boolean } = {}): Promise<Response> {
  const errors = { 'Cache-Control': 'no-store' };
  if (request.method !== 'GET') return Response.json({ message: 'Use GET for the library catalogue.' },
    { status: 405, headers: { ...errors, Allow: 'GET' } });
  if (new URL(request.url).search) return Response.json({ message: 'The catalogue does not accept search parameters.' }, { status: 400, headers: errors });
  try {
    const row = await env.DB.prepare(`WITH published AS (
      SELECT l.id, l.slug, l.institution_id AS institution, l.is_fixture AS isFixture, r.id AS revisionId, r.content
      FROM library l JOIN library_revision r ON r.library_id = l.id
      WHERE r.status = 'published' AND (? = 1 OR l.is_fixture = 0) ORDER BY l.slug
    ), origins AS (
      SELECT id, name, latitude, longitude FROM suburb WHERE ? = 1 OR is_fixture = 0 ORDER BY name, id
    ), origin_document AS (
      SELECT json_group_array(json_object('id', id, 'name', name, 'latitude', latitude, 'longitude', longitude)) AS document FROM origins
    ) SELECT json_object('schemaVersion', 1, 'libraries', json((SELECT json_group_array(json_object(
      'id', id, 'slug', slug, 'institution', institution, 'isFixture', json(CASE WHEN isFixture = 1 THEN 'true' ELSE 'false' END),
      'revisionId', revisionId, 'status', 'published', 'content', json_object(
        'name', json_extract(content, '$.name'), 'address', json_extract(content, '$.address'),
        'suburbId', json_extract(content, '$.suburbId'), 'latitude', json_extract(content, '$.latitude'),
        'longitude', json_extract(content, '$.longitude'), 'description', json_extract(content, '$.description'),
        'officialUrl', json_extract(content, '$.officialUrl'), 'photos', json_extract(content, '$.photos'),
        'facilities', json_extract(content, '$.facilities'), 'wifi', json_extract(content, '$.wifi'),
        'schedule', json_extract(content, '$.schedule'), 'sources', json_extract(content, '$.sources')
      ))) FROM published)), 'origins', json(origin_document.document)) AS body,
      (SELECT json_group_array(revisionId) FROM published) || ':' || origin_document.document AS fingerprint
      FROM origin_document`).bind(Number(options.includeFixtures === true), Number(options.includeFixtures === true))
      .first<{ body: string; fingerprint: string }>();
    if (!row) throw new Error('Catalogue unavailable.');
    // Revision IDs change on publish/unpublish; origins are included in the version too.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.fingerprint));
    const version = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const etag = `W/"${version}"`;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
    const previous = request.headers.get('If-None-Match');
    if (previous === '*' || previous?.split(',').some((value) => value.trim() === etag)) return new Response(null, { status: 304, headers });
    return new Response(row.body, { headers });
  } catch {
    console.error(JSON.stringify({ event: 'catalogue_read_failed' }));
    return Response.json({ message: 'Library information is temporarily unavailable. Please try again.' }, { status: 503, headers: errors });
  }
}
