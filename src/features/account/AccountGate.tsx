import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from './use-account';
import styles from './AccountPages.module.css';

export function AccountGate({ children }: { children: ReactNode }) {
  const state = useAccount();
  const location = useLocation();
  if (state.loading) return <p role="status">Loading your account…</p>;
  if (state.error) return <div className={styles.panel} role="alert"><p>{state.error}</p><button type="button" onClick={state.refresh}>Try again</button></div>;
  if (!state.account) return <section className={styles.page}><div className={styles.panel}><h1>Sign in to continue</h1><Link className={styles.button} to={`/sign-in?${new URLSearchParams({ returnTo: location.pathname + location.search })}`}>Sign in</Link><p><Link to="/">Browse libraries</Link></p></div></section>;
  return children;
}
