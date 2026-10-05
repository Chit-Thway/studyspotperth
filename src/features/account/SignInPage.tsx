import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { internalReturnTo } from '../../domain/account';
import { authClient } from './client';
import { useAccount } from './use-account';
import styles from './AccountPages.module.css';

export function SignInPage() {
  const [params] = useSearchParams();
  const account = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = internalReturnTo(params.get('returnTo'));
  useEffect(() => { document.title = 'Sign in · StudySpot Perth'; }, []);
  if (account.account) return <Navigate to={target} replace />;
  async function signIn() {
    setPending(true); setError(null);
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: new URL(target, window.location.origin).href,
        errorCallbackURL: new URL(`/sign-in?${new URLSearchParams({ returnTo: target, failed: 'true' })}`, window.location.origin).href });
      if (result.error) { setError('Couldn’t start sign-in. Please try again.'); setPending(false); }
    } catch { setError('Couldn’t start sign-in. Check your connection.'); setPending(false); }
  }
  return <section className={styles.page}><Link className={styles.back} to={target}>← Back</Link><div className={styles.panel}>
    <h1>Sign in</h1><p>Keep your favourite libraries and university cards handy.</p>
    {(error || params.has('failed')) && <p className={styles.error} role="alert">{error ?? 'Sign-in wasn’t completed. Please try again.'}</p>}
    {account.error && <p role="alert">{account.error} <button type="button" onClick={account.refresh}>Try again</button></p>}
    <button className={`${styles.button} ${styles.google}`} type="button" disabled={pending || account.loading || !account.googleEnabled} onClick={() => { void signIn(); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.6a4.8 4.8 0 0 1-2.1 3.1V20h3.4c2-1.9 3.1-4.6 3.1-7.8Z"/><path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1.9-3.5.9-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10.4 10.4 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.2 13.5a6.2 6.2 0 0 1 0-3.8V7H2.7a10.4 10.4 0 0 0 0 9.2l3.5-2.7Z"/><path fill="#EA4335" d="M12 5.6c1.6 0 3 .5 4.1 1.6l3.1-3A10 10 0 0 0 12 1.5 10.4 10.4 0 0 0 2.7 7l3.5 2.7C7 7.3 9.3 5.6 12 5.6Z"/></svg>
      {pending ? 'Connecting…' : 'Continue with Google'}
    </button>
    {!account.loading && !account.googleEnabled && !account.error && <p role="status">Google sign-in is not configured yet.</p>}
    <p className={styles.note}>No university email or student number needed.</p>
    <p><Link to="/">Continue browsing</Link></p>
  </div></section>;
}
