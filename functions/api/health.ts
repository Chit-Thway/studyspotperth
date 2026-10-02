import { sql } from 'drizzle-orm';
import { createDatabase } from '../../server/db/client';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'GET') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }

  try {
    const result = await createDatabase(context.env).get<{ value: number }>(sql`SELECT 1 AS value`);
    if (result?.value !== 1) throw new Error('Database check failed.');
    return Response.json(
      { status: 'ok', database: 'connected', timeZone: 'Australia/Perth' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    console.error(JSON.stringify({ event: 'database_health_failed' }));
    return Response.json({ error: 'database_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
