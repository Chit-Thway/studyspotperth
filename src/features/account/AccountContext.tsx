import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AccountResponse } from '../../domain/account';
import { AccountApiError, accountRequest, authClient } from './client';
import { AccountContext, type SignOutGuard } from './account-context';

export function AccountProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AccountResponse>({ account: null, googleEnabled: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const mutation = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const signOutGuard = useRef<SignOutGuard | null>(null);
  const registerSignOutGuard = useCallback((guard: SignOutGuard) => {
    signOutGuard.current = guard;
    return () => { if (signOutGuard.current === guard) signOutGuard.current = null; };
  }, []);
  const refresh = useCallback(() => {
    if (mutation.current) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const version = ++sequence.current;
    void accountRequest<AccountResponse>('/api/account', { signal: controller.signal }).then((response) => {
      if (sequence.current === version) { setData(response); setError(null); }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted && sequence.current === version) {
        if (failure instanceof AccountApiError && [401, 403].includes(failure.status)) setData((current) => ({ ...current, account: null }));
        setError('Account information couldn’t load.');
      }
    }).finally(() => { if (sequence.current === version) setLoading(false); });
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => { activeRequest.current?.abort(); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  async function update(url: string, init: RequestInit) {
    if (mutation.current) throw new Error('Please wait for the current change.');
    mutation.current = true;
    setBusy(true);
    activeRequest.current?.abort();
    ++sequence.current;
    try { setData(await accountRequest<AccountResponse>(url, init)); setError(null); }
    catch (failure) {
      if (failure instanceof AccountApiError && failure.status === 401) setData((current) => ({ ...current, account: null }));
      throw failure;
    } finally { mutation.current = false; setBusy(false); setLoading(false); }
  }
  async function signOut(onSuccess?: () => void) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    try {
      const action = async () => {
        activeRequest.current?.abort(); ++sequence.current;
        const result = await authClient.signOut();
        if (result.error) throw new Error('Couldn’t sign out. Please try again.');
        setData((current) => ({ ...current, account: null })); setError(null);
        onSuccess?.();
      };
      if (signOutGuard.current) await signOutGuard.current(action);
      else await action();
    } finally { mutation.current = false; setBusy(false); setLoading(false); }
  }
  return <AccountContext value={{ ...data, loading, busy, error, refresh, signOut, registerSignOutGuard,
    savePreferences: (preferences) => update('/api/account', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences) }),
    setFavourite: (id, save) => update(`/api/account/favourites/${encodeURIComponent(id)}`, { method: save ? 'PUT' : 'DELETE' }),
  }}>{children}</AccountContext>;
}
