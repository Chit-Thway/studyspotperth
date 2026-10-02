import { drizzle } from 'drizzle-orm/d1';
import * as authSchema from './auth-schema';
import * as librarySchema from './library-schema';

export function createDatabase(env: Env) {
  return drizzle(env.DB, { schema: { ...authSchema, ...librarySchema } });
}
export type Database = ReturnType<typeof createDatabase>;
