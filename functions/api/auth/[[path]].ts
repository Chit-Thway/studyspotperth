import { createAuth } from '../../../server/auth/create-auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!context.env.AUTH_SECRET || context.env.AUTH_SECRET.length < 32) {
    return Response.json({ error: 'auth_not_configured' }, { status: 503 });
  }
  try {
    const response = await createAuth(context.env).handler(context.request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    console.error(JSON.stringify({ event: 'auth_request_failed' }));
    return Response.json({ error: 'auth_unavailable', message: 'Sign-in is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
