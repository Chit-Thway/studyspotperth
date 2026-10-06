import { useEffect, useReducer, useState } from 'react';
import { LibraryApiError, readLibraryApi } from './api';
import { libraryStateForUrl, reduceLibraryApi } from './library-api-state';
import { locationHeader, type Coordinates } from '../../domain/location';

export function useLibraryApi<T>(url: string, refreshNow = false, coordinates?: Coordinates | null) {
  const header = locationHeader(coordinates);
  const key = `${url}${header ? `|location:${header}` : ''}`;
  const [reload, setReload] = useState(0);
  const [state, dispatch] = useReducer(reduceLibraryApi<T>, { url: key, data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: 'start', url: key });
    void readLibraryApi<T>(url, controller.signal, header).then((data) => {
      if (!controller.signal.aborted) dispatch({ type: 'success', url: key, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) dispatch({ type: 'error', url: key, error: error instanceof LibraryApiError ? error : new Error('Library information couldn’t load. Check your connection and try again.') });
    });
    return () => controller.abort();
  }, [url, key, header, reload]);
  useEffect(() => {
    if (!refreshNow) return;
    const interval = window.setInterval(() => { if (!document.hidden) setReload((value) => value + 1); }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshNow]);
  // An old result must never appear under newly selected filters, even for one render.
  const current = libraryStateForUrl(state, key);
  return { ...current, retry: () => setReload((value) => value + 1) };
}
