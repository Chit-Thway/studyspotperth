import { createAuth } from '../../../server/auth/create-auth';

// Only the health route is exposed; account endpoints are disabled.
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  if (url.pathname !== '/api/auth/ok' || context.request.method !== 'GET') {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  if (!context.env.AUTH_SECRET || context.env.AUTH_SECRET.length < 32) {
    return Response.json({ error: 'auth_not_configured' }, { status: 503 });
  }
  return createAuth(context.env).handler(context.request);
};
