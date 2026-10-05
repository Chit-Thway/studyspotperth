import type { AdminLibrary, AdminList } from '../../src/domain/admin';
import { parseAdminContent, validateAdminPublication } from '../../src/domain/admin';
import type { LibraryContent, LibraryRecord } from '../../src/domain/library';
import type { Institution } from '../../src/domain/search-context';
import { parseLibraryContent } from '../../src/domain/parse-library';
import { AccountError } from '../account/session';

type Row = Omit<LibraryRecord, 'content' | 'isFixture'> & { content: string; isFixture: number; publishedRevisionId: string | null };
// rowid gives insertion order even when two immutable revisions share a timestamp.
const select = `SELECT l.id, l.slug, l.institution_id AS institution, l.is_fixture AS isFixture,
  r.id AS revisionId, r.status, r.content,
  (SELECT p.id FROM library_revision p WHERE p.library_id=l.id AND p.status='published') AS publishedRevisionId
  FROM library l INNER JOIN library_revision r ON r.rowid=(SELECT last.rowid FROM library_revision last WHERE last.library_id=l.id ORDER BY last.rowid DESC LIMIT 1)
  WHERE l.is_fixture=0`;
function canonical(row: Row): AdminLibrary {
  const { publishedRevisionId, ...record } = row;
  return { record: { ...record, isFixture: Boolean(row.isFixture), content: parseLibraryContent(JSON.parse(row.content)) }, publishedRevisionId };
}

/** All callers must pass the HTTP administrator guard before reaching this boundary. */
export function createAdminRepository(env: Env) {
  async function get(id: string): Promise<AdminLibrary> {
    const row = await env.DB.prepare(`${select} AND l.id=?`).bind(id).first<Row>();
    if (!row) throw new AccountError(404, 'Library not found.');
    return canonical(row);
  }
  async function list(afterSlug: string): Promise<AdminList> {
    const rows = await env.DB.prepare(`${select} AND l.slug>? ORDER BY l.slug LIMIT 101`).bind(afterSlug).all<Row>();
    const page = rows.results.slice(0, 100);
    return { libraries: page.map(canonical), nextSlug: rows.results.length > 100 ? page.at(-1)!.slug : null };
  }
  async function validate(value: unknown): Promise<LibraryContent> {
    let content: LibraryContent;
    try { content = parseAdminContent(value); } catch (error) { throw new AccountError(400, error instanceof Error ? error.message : 'Invalid library.'); }
    if (content.sources.some((source) => source.kind === 'fixture')) throw new AccountError(400, 'Fixture sources cannot be used for library records.');
    if (content.suburbId && !await env.DB.prepare('SELECT id FROM suburb WHERE id=? AND is_fixture=0').bind(content.suburbId).first()) throw new AccountError(400, 'Select an available suburb.');
    return content;
  }
  async function create(slug: string, institution: Institution, value: unknown) {
    const content = await validate(value);
    const id = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO library(id,slug,institution_id,is_fixture) VALUES (?,?,?,0)').bind(id, slug, institution),
        env.DB.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at) VALUES (?,?,'draft',?,?)").bind(revisionId, id, JSON.stringify(content), Date.now()),
      ]);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: library.slug/.test(error.message)) throw new AccountError(409, 'This library address is already used. Choose another slug.');
      throw error;
    }
    return get(id);
  }
  async function save(id: string, baseRevisionId: string, value: unknown) {
    await get(id);
    const content = await validate(value);
    const revisionId = crypto.randomUUID();
    const result = await env.DB.prepare(`INSERT INTO library_revision(id,library_id,status,content,created_at)
      SELECT ?,l.id,'draft',?,? FROM library l WHERE l.id=? AND l.is_fixture=0
      AND (SELECT r.id FROM library_revision r WHERE r.library_id=l.id ORDER BY r.rowid DESC LIMIT 1)=?`)
      .bind(revisionId, JSON.stringify(content), Date.now(), id, baseRevisionId).run();
    if (result.meta.changes !== 1) throw new AccountError(409, 'This record changed in another tab. Reload before saving.');
    return get(id);
  }
  async function publish(id: string, revisionId: string) {
    const current = await get(id);
    if (current.record.revisionId !== revisionId || current.record.status !== 'draft') throw new AccountError(409, 'Save and reload the latest draft before publishing.');
    const content = await validate(current.record.content);
    try { validateAdminPublication(content); } catch (error) { throw new AccountError(400, error instanceof Error ? error.message : 'Missing sources.'); }
    const guard = `EXISTS (SELECT 1 FROM library_revision d WHERE d.id=? AND d.library_id=? AND d.status='draft'
      AND d.rowid=(SELECT MAX(last.rowid) FROM library_revision last WHERE last.library_id=d.library_id))`;
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE library_revision SET status='archived' WHERE library_id=? AND status='published' AND ${guard}`).bind(id, revisionId, id),
      env.DB.prepare(`UPDATE library_revision SET status='published',published_at=? WHERE id=? AND ${guard}`).bind(Date.now(), revisionId, revisionId, id),
    ]);
    if (results[1].meta.changes !== 1) throw new AccountError(409, 'The draft changed before publication. Reload and try again.');
    return get(id);
  }
  async function unpublish(id: string, revisionId: string) {
    await get(id);
    const result = await env.DB.prepare("UPDATE library_revision SET status='archived' WHERE library_id=? AND id=? AND status='published'").bind(id, revisionId).run();
    if (result.meta.changes !== 1) throw new AccountError(409, 'The public version changed. Reload before unpublishing.');
    return get(id);
  }
  return { get, list, validate, create, save, publish, unpublish };
}
