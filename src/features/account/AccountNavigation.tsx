import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { internalReturnTo } from '../../domain/account';
import { useAccount } from './use-account';
import { Icon } from '../libraries/Icon';
import styles from '../../app/App.module.css';

export function AccountNavigation() {
  const state = useAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState('');
  const target = internalReturnTo(location.pathname + location.search);
  const search = location.pathname === '/sign-in' ? '' : location.search;
  return <div className={styles.accountControls}>
    <Link className={styles.saved} to={`/saved${search}`}><Icon name="heart" />Saved</Link>
    {state.account ? <details ref={menu} className={styles.accountMenu}><summary>Profile</summary><div className={styles.accountDropdown}>
      <Link to={`/profile${search}`} onClick={() => { menu.current?.removeAttribute('open'); }}>Your profile</Link><Link to={`/saved${search}`} onClick={() => { menu.current?.removeAttribute('open'); }}>Saved libraries</Link>
      {state.account.isAdmin && <Link to="/admin" onClick={() => { menu.current?.removeAttribute('open'); }}>Manage libraries</Link>}
      <button type="button" disabled={state.busy} onClick={() => {
        setError(''); void state.signOut(() => { menu.current?.removeAttribute('open'); void navigate(`/${search}`); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Couldn’t sign out.'));
      }}>Sign out</button>{error && <p role="alert">{error}</p>}
    </div></details> : <Link className={styles.signIn} to={`/sign-in?${new URLSearchParams({ returnTo: target })}`}>Sign in</Link>}
  </div>;
}
