import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from './use-account';
import styles from './AccountPages.module.css';

export function AccountGate({ children }: { children: ReactNode }) {
  const state = useAccount();
  const location = useLocation();
  const feedback = state.error ? <div className={styles.panel} role="alert"><p>{state.error}</p><button type="button" onClick={state.refresh}>Try again</button></div>
    : state.loading ? <p role="status">Loading your account…</p> : null;
  if (!state.account && feedback) return feedback;
  if (!state.account) return <section className={styles.page}><div className={styles.panel}><h1>Sign in to continue</h1><Link className={styles.button} to={`/sign-in?${new URLSearchParams({ returnTo: location.pathname + location.search })}`}>Sign in</Link><p><Link to="/">Browse libraries</Link></p></div></section>;
  // Keep the wrapper stable across refresh failures so unsaved child state survives.
  return <>{feedback}<fieldset className={styles.protectedContent} disabled={state.loading || Boolean(state.error)}>{children}</fieldset></>;
}
