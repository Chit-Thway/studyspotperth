import { LibraryApiError } from './api';

export interface LibraryApiState<T> {
  url: string;
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export type LibraryApiAction<T> =
  | { type: 'start'; url: string }
  | { type: 'success'; url: string; data: T }
  | { type: 'error'; url: string; error: Error };

/** Cached data belongs to one selection only, including before its effect runs. */
export function libraryStateForUrl<T>(state: LibraryApiState<T>, url: string): LibraryApiState<T> {
  return state.url === url ? state : { url, data: null, error: null, loading: true };
}

export function reduceLibraryApi<T>(state: LibraryApiState<T>, action: LibraryApiAction<T>): LibraryApiState<T> {
  if (action.type === 'start') {
    const current = libraryStateForUrl(state, action.url);
    return { ...current, error: null, loading: current.data === null };
  }
  if (state.url !== action.url) return state;
  if (action.type === 'success') return { url: action.url, data: action.data, error: null, loading: false };
  // Temporary failures retain the last result with a visible warning. Invalid or
  // withdrawn resources must disappear rather than remain as cached information.
  const unavailable = action.error instanceof LibraryApiError && action.error.status >= 400 && action.error.status < 500
    && action.error.status !== 408 && action.error.status !== 429;
  return { ...state, data: unavailable ? null : state.data, error: action.error, loading: false };
}
