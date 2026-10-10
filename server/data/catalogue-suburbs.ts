import type { CatalogueImport } from './catalogue-import.ts';
import { parseAdminContent } from '../../src/domain/admin.ts';

export interface PublishedCatalogueRow { id: string; slug: string; revisionId: string; content: string }

/** Explicit metadata-only upgrade: keep every existing fact and preserve drafts/archives. */
export function createCatalogueSuburbLinks(catalogue: CatalogueImport, published: PublishedCatalogueRow[]) {
  const statements: string[] = [];
  const linked: string[] = [];
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const timestamp = Date.parse(`${catalogue.checkedOn}T00:00:00+08:00`);
  for (const row of published) {
    const source = catalogue.libraries.find((library) => library.id === row.id && library.slug === row.slug);
    if (!source?.content.suburbId) continue;
    const current = parseAdminContent(JSON.parse(row.content));
    if (current.suburbId || current.address !== source.content.address || current.latitude !== source.content.latitude || current.longitude !== source.content.longitude) continue;
    const id = `${row.id}-physical-suburb-v1`;
    const content = JSON.stringify({ ...current, suburbId: source.content.suburbId });
    statements.push(
      `INSERT INTO library_revision(id,library_id,status,content,created_at) SELECT ${quote(id)},r.library_id,'draft',${quote(content)},${timestamp} FROM library_revision r JOIN library l ON l.id=r.library_id WHERE l.id=${quote(row.id)} AND l.slug=${quote(row.slug)} AND l.is_fixture=0 AND r.id=${quote(row.revisionId)} AND r.status='published' AND r.content=${quote(row.content)} AND r.rowid=(SELECT MAX(other.rowid) FROM library_revision other WHERE other.library_id=l.id) AND NOT EXISTS(SELECT 1 FROM library_revision existing WHERE existing.id=${quote(id)});`,
      `UPDATE library_revision SET status='archived' WHERE id=${quote(row.revisionId)} AND status='published' AND EXISTS(SELECT 1 FROM library_revision r WHERE r.id=${quote(id)} AND r.status='draft' AND r.content=${quote(content)});`,
      `UPDATE library_revision SET status='published',published_at=${timestamp} WHERE id=${quote(id)} AND status='draft' AND NOT EXISTS(SELECT 1 FROM library_revision r WHERE r.library_id=${quote(row.id)} AND r.status='published');`,
    );
    linked.push(row.slug);
  }
  return { statements, linked };
}
