import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { createDatabase } from '../db/client';

export function createAuth(env: Env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new Error('Auth requires a secret of at least 32 characters.');
  }

  return betterAuth({
    baseURL: env.AUTH_BASE_URL,
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(createDatabase(env), { provider: 'sqlite', transaction: false }),
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {},
  });
}
