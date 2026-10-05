import { describe, expect, it } from 'vitest';
import type { AdminLibrary } from '../../domain/admin';
import { emptyLibraryContent } from '../../domain/admin';
import { afterUnpublish } from './editor-state';

function revision(id: string, status: AdminLibrary['record']['status'], description = ''): AdminLibrary {
  return { record: { id: 'library', slug: 'synthetic-library', institution: 'public', isFixture: false, revisionId: id, status,
    content: { ...emptyLibraryContent(), name: 'Original name', description } }, publishedRevisionId: status === 'published' ? id : 'public-revision' };
}

describe('unpublish editor state', () => {
  it('keeps the original editing revision and content when another tab saved a newer draft', () => {
    const original = revision('R1', 'published');
    const response = { ...revision('R2', 'draft', 'Other administrator description'), publishedRevisionId: null };
    const result = afterUnpublish(original, response);
    expect(result.record.revisionId).toBe('R1');
    expect(result.record.content).toBe(original.record.content);
    expect(result.record.status).toBe('archived');
    expect(result.publishedRevisionId).toBeNull();
    expect(original.record.status).toBe('published');
    expect(response.record.content.description).toBe('Other administrator description');
  });

  it('preserves a draft editing base and its status while clearing publication metadata', () => {
    const original = revision('R2', 'draft');
    const response = { ...revision('R3', 'draft', 'Newer draft'), publishedRevisionId: null };
    const result = afterUnpublish(original, response);
    expect(result.record).toEqual(original.record);
    expect(result.publishedRevisionId).toBeNull();
  });

  it('retains the same base when unpublishing without a competing edit', () => {
    const original = revision('R1', 'published');
    const response = { ...revision('R1', 'archived'), publishedRevisionId: null };
    expect(afterUnpublish(original, response)).toEqual(response);
  });
});
