import { describe, expect, it } from 'vitest';
import { LibraryApiError } from './api';
import { libraryStateForUrl, reduceLibraryApi } from './library-api-state';
import type { LibraryApiState } from './library-api-state';

const url = '/api/libraries/example?cards=uwa';
const data = { checkedAt: '2026-10-02T10:00:00+08:00' };
const loaded: LibraryApiState<typeof data> = { url, data, error: null, loading: false };

describe('library request refresh state', () => {
  it('retains the rendered result during a same-selection refresh', () => {
    const refreshing = reduceLibraryApi(loaded, { type: 'start', url });
    expect(refreshing.data).toBe(data);
    expect(refreshing.loading).toBe(false);
  });

  it('replaces cached information when refreshed data arrives', () => {
    const updated = { checkedAt: '2026-10-02T10:01:00+08:00' };
    const refreshing = reduceLibraryApi(loaded, { type: 'start', url });
    expect(reduceLibraryApi(refreshing, { type: 'success', url, data: updated }))
      .toEqual({ url, data: updated, loading: false, error: null });
  });

  it.each(['/api/libraries/another', '/api/libraries/example?cards=curtin'])('hides old data immediately under changed URL %s', (nextUrl) => {
    const expected = { url: nextUrl, data: null, error: null, loading: true };
    expect(libraryStateForUrl(loaded, nextUrl)).toEqual(expected);
    expect(reduceLibraryApi(loaded, { type: 'start', url: nextUrl })).toEqual(expected);
  });

  it('ignores late success and failure from a previous selection', () => {
    const changed = reduceLibraryApi(loaded, { type: 'start', url: '/api/libraries/another' });
    expect(reduceLibraryApi(changed, { type: 'success', url, data })).toBe(changed);
    expect(reduceLibraryApi(changed, { type: 'error', url, error: new Error('Old request') })).toBe(changed);
  });

  it.each([new Error('Offline'), new LibraryApiError(503, 'Unavailable'), new LibraryApiError(429, 'Try later')])('retains data and exposes a transient refresh failure: %s', (error) => {
    expect(reduceLibraryApi(loaded, { type: 'error', url, error }))
      .toEqual({ url, data, error, loading: false });
  });

  it.each([400, 403, 404])('withdraws cached results for HTTP %s', (status) => {
    expect(reduceLibraryApi(loaded, { type: 'error', url, error: new LibraryApiError(status, 'Unavailable') }).data).toBeNull();
  });

  it('keeps initial-load failures separate from background failures', () => {
    const initial = libraryStateForUrl(loaded, '/api/libraries/another');
    const error = new Error('Offline');
    expect(reduceLibraryApi(initial, { type: 'error', url: initial.url, error }))
      .toEqual({ ...initial, loading: false, error });
  });

  it('clears the refresh warning on retry without removing cached content', () => {
    const failed = reduceLibraryApi(loaded, { type: 'error', url, error: new Error('Offline') });
    expect(reduceLibraryApi(failed, { type: 'start', url })).toEqual(loaded);
  });
});
