import type { CatalogueImport } from './catalogue-import.ts';
import { parseAdminContent } from '../../src/domain/admin.ts';

export interface PublishedCatalogueRow { id: string; slug: string; revisionId: string; content: string }

/** Explicit metadata-only upgrade: keep every existing fact and preserve drafts/archives. */
export function createCatalogueMetadataLinks(catalogue: CatalogueImport, published: PublishedCatalogueRow[], options: { suburbs?: boolean; sizes?: boolean }) {
  const statements: string[] = [];
  const linkedSuburbs: string[] = [];
  const linkedSizes: string[] = [];
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const timestamp = Date.parse(`${catalogue.checkedOn}T00:00:00+08:00`);
  for (const row of published) {
    const source = catalogue.libraries.find((library) => library.id === row.id && library.slug === row.slug);
    if (!source) continue;
    const current = parseAdminContent(JSON.parse(row.content));
    if (current.address !== source.content.address || current.latitude !== source.content.latitude || current.longitude !== source.content.longitude) continue;
    const linkSuburb = Boolean(options.suburbs && !current.suburbId && source.content.suburbId);
    const linkSize = Boolean(options.sizes && current.size === undefined && source.content.size);
    if (!linkSuburb && !linkSize) continue;
    const id = `${row.id}-${linkSuburb ? 'physical-suburb' : ''}${linkSuburb && linkSize ? '-' : ''}${linkSize ? 'size' : ''}-v1`;
    const content = JSON.stringify({ ...current,
      ...(linkSuburb ? { suburbId: source.content.suburbId } : {}),
      ...(linkSize ? { size: source.content.size } : {}),
    });
    statements.push(
      `INSERT INTO library_revision(id,library_id,status,content,created_at) SELECT ${quote(id)},r.library_id,'draft',${quote(content)},${timestamp} FROM library_revision r JOIN library l ON l.id=r.library_id WHERE l.id=${quote(row.id)} AND l.slug=${quote(row.slug)} AND l.is_fixture=0 AND r.id=${quote(row.revisionId)} AND r.status='published' AND r.content=${quote(row.content)} AND r.rowid=(SELECT MAX(other.rowid) FROM library_revision other WHERE other.library_id=l.id) AND NOT EXISTS(SELECT 1 FROM library_revision existing WHERE existing.id=${quote(id)});`,
      `UPDATE library_revision SET status='archived' WHERE id=${quote(row.revisionId)} AND status='published' AND EXISTS(SELECT 1 FROM library_revision r WHERE r.id=${quote(id)} AND r.status='draft' AND r.content=${quote(content)});`,
      `UPDATE library_revision SET status='published',published_at=${timestamp} WHERE id=${quote(id)} AND status='draft' AND NOT EXISTS(SELECT 1 FROM library_revision r WHERE r.library_id=${quote(row.id)} AND r.status='published');`,
    );
    if (linkSuburb) linkedSuburbs.push(row.slug);
    if (linkSize) linkedSizes.push(row.slug);
  }
  return { statements, linkedSuburbs, linkedSizes };
}
