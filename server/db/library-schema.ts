import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { LibraryContent } from '../../src/domain/library';
import { user } from './auth-schema';

export const institutions = sqliteTable('institution', {
  id: text('id', { enum: ['public', 'uwa', 'curtin', 'ecu', 'murdoch'] }).primaryKey(),
  name: text('name').notNull(),
}, (table) => [check('institution_code', sql`${table.id} IN ('public','uwa','curtin','ecu','murdoch')`)]);

export const suburbs = sqliteTable('suburb', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  latitude: real('latitude').notNull(), longitude: real('longitude').notNull(),
  sourceUrl: text('source_url'), checkedOn: text('checked_on'),
  isFixture: integer('is_fixture', { mode: 'boolean' }).notNull().default(false),
}, (table) => [check('suburb_coordinates', sql`${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180`),
  check('suburb_fixture_boolean', sql`${table.isFixture} IN (0,1)`),
  check('suburb_real_source', sql`${table.isFixture} = 1 OR (${table.sourceUrl} IS NOT NULL AND ${table.sourceUrl} LIKE 'https://%' AND ${table.checkedOn} IS NOT NULL)`)]);

export const libraries = sqliteTable('library', {
  id: text('id').primaryKey(), slug: text('slug').notNull().unique(),
  institutionId: text('institution_id').notNull().references(() => institutions.id),
  isFixture: integer('is_fixture', { mode: 'boolean' }).notNull().default(false),
}, (table) => [index('library_institution_idx').on(table.institutionId), check('library_fixture_boolean', sql`${table.isFixture} IN (0,1)`)]);

export const libraryRevisions = sqliteTable('library_revision', {
  id: text('id').primaryKey(), libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  content: text('content', { mode: 'json' }).$type<LibraryContent>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('revision_library_status_idx').on(table.libraryId, table.status, table.createdAt),
  uniqueIndex('one_published_revision').on(table.libraryId).where(sql`${table.status} = 'published'`),
  check('revision_status', sql`${table.status} IN ('draft','published','archived')`),
  check('revision_content_json', sql`json_valid(${table.content}) AND json_type(${table.content}) = 'object'`),
  check('revision_publication_date', sql`${table.status} != 'published' OR ${table.publishedAt} IS NOT NULL`),
]);

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  suburbId: text('suburb_id').references(() => suburbs.id, { onDelete: 'set null' }),
});
export const userCards = sqliteTable('user_card', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  institutionId: text('institution_id').notNull().references(() => institutions.id),
}, (table) => [primaryKey({ columns: [table.userId, table.institutionId] }),
  check('university_card_only', sql`${table.institutionId} != 'public'`)]);
export const favourites = sqliteTable('favourite', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.userId, table.libraryId] }), index('favourite_library_idx').on(table.libraryId)]);
export const userRoles = sqliteTable('user_role', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
}, (table) => [check('user_role_value', sql`${table.role} IN ('user','admin')`)]);
