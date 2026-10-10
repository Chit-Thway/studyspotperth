import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CatalogueContext } from './catalogue-context';
import { readPublicCatalogue, type CatalogueSnapshot } from './catalogue-client';
import { LibraryApiError } from './api';

export function CatalogueProvider({ children }: { children: ReactNode }) {
  const snapshot = useRef<CatalogueSnapshot | null>(null);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ data: null as CatalogueSnapshot['catalogue'] | null, loading: true, error: null as Error | null });
  const retry = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const next = await readPublicCatalogue(snapshot.current, controller.signal);
        if (!controller.signal.aborted) {
          snapshot.current = next;
          setState({ data: next.catalogue, loading: false, error: null });
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          const unavailable = failure instanceof LibraryApiError && failure.status >= 400 && failure.status < 500
            && failure.status !== 408 && failure.status !== 429;
          if (unavailable) snapshot.current = null;
          setState({ data: snapshot.current?.catalogue ?? null, loading: false,
            error: failure instanceof Error ? failure : new Error('Library information couldn’t load.') });
        }
      } finally { pending = false; }
    }
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = window.setInterval(visible, 60_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => {
      controller.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible);
    };
  }, [reload]);
  return <CatalogueContext value={{ ...state, retry }}>{children}</CatalogueContext>;
}
