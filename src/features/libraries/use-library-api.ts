import { useEffect, useReducer, useState } from 'react';
import { LibraryApiError, readLibraryApi } from './api';
import { libraryStateForUrl, reduceLibraryApi } from './library-api-state';

export function useLibraryApi<T>(url: string, refreshNow = false) {
  const [reload, setReload] = useState(0);
  const [state, dispatch] = useReducer(reduceLibraryApi<T>, { url, data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: 'start', url });
    void readLibraryApi<T>(url, controller.signal).then((data) => {
      if (!controller.signal.aborted) dispatch({ type: 'success', url, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) dispatch({ type: 'error', url, error: error instanceof LibraryApiError ? error : new Error('Library information couldn’t load. Check your connection and try again.') });
    });
    return () => controller.abort();
  }, [url, reload]);
  useEffect(() => {
    if (!refreshNow) return;
    const interval = window.setInterval(() => { if (!document.hidden) setReload((value) => value + 1); }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshNow]);
  // An old result must never appear under newly selected filters, even for one render.
  const current = libraryStateForUrl(state, url);
  return { ...current, retry: () => setReload((value) => value + 1) };
}
