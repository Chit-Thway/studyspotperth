import type { AdminLibrary } from '../../domain/admin';

export function afterUnpublish(editingBase: AdminLibrary, response: AdminLibrary): AdminLibrary {
  // Publication metadata may arrive with another tab's latest draft. Its
  // content/revision must never become the base of this editor's older edits.
  return { ...editingBase, publishedRevisionId: response.publishedRevisionId,
    record: { ...editingBase.record, status: editingBase.record.status === 'published' && editingBase.record.revisionId !== response.publishedRevisionId ? 'archived' : editingBase.record.status } };
}
