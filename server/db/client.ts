import { drizzle } from 'drizzle-orm/d1';
import * as authSchema from './auth-schema';

export function createDatabase(env: Env) {
  return drizzle(env.DB, { schema: authSchema });
}
