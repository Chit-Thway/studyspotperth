import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../libraries/Icon';
import { useAccount } from './use-account';
import { internalReturnTo } from '../../domain/account';
import styles from './AccountPages.module.css';

export function SaveButton({ id, name, label = false }: { id: string; name: string; label?: boolean }) {
  const state = useAccount();
  const location = useLocation();
  const [error, setError] = useState('');
  if (!state.account) return <Link className={styles.save} aria-label={`Sign in to save ${name}`} title="Sign in to save" to={`/sign-in?${new URLSearchParams({ returnTo: internalReturnTo(location.pathname + location.search) })}`}><Icon name="heart" />{label && 'Save'}</Link>;
  const saved = state.account.favouriteIds.includes(id);
  return <div className={styles.saveWrap}><button className={styles.save} type="button" disabled={state.busy || state.loading} aria-pressed={saved} aria-label={saved ? `Remove ${name} from saved libraries` : `Save ${name}`} title={saved ? 'Remove from saved libraries' : 'Save library'} onClick={() => {
    setError(''); void state.setFavourite(id, !saved).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Couldn’t update saved library.'));
  }}><Icon name="heart" />{label && (saved ? 'Saved' : 'Save')}</button>{error && <p className={styles.saveError} role="alert">{error}</p>}</div>;
}
