import { createAuth } from '../auth/create-auth';

export class AccountError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function accountSession(request: Request, env: Env) {
  const { response, headers } = await createAuth(env).api.getSession({ headers: request.headers, returnHeaders: true });
  return { session: response, headers };
}

/** Server-owned role; callers cannot choose either the account ID or role. */
export async function requireAdmin(request: Request, env: Env) {
  const result = await accountSession(request, env);
  if (!result.session) throw new AccountError(401, 'Sign in to continue.');
  const role = await env.DB.prepare('SELECT role FROM user_role WHERE user_id = ?').bind(result.session.user.id).first<{ role: string }>();
  if (role?.role !== 'admin') throw new AccountError(403, 'Administrator access required.');
  return { ...result, userId: result.session.user.id };
}
