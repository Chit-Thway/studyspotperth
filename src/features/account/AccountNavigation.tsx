import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { internalReturnTo } from '../../domain/account';
import { finderUrl } from '../finder/finder-state';
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
  const params = new URLSearchParams(location.pathname === '/sign-in' ? '' : location.search);
  return <div className={styles.accountControls}>
    <Link className={styles.saved} to={finderUrl(params, '/saved')}><Icon name="heart" />Saved</Link>
    {state.account ? <details ref={menu} className={styles.accountMenu}><summary>Profile</summary><div className={styles.accountDropdown}>
      <Link to={finderUrl(params, '/profile')} onClick={() => { menu.current?.removeAttribute('open'); }}>Your profile</Link><Link to={finderUrl(params, '/saved')} onClick={() => { menu.current?.removeAttribute('open'); }}>Saved libraries</Link>
      {state.account.isAdmin && <Link to="/admin" onClick={() => { menu.current?.removeAttribute('open'); }}>Manage libraries</Link>}
      <button type="button" disabled={state.busy} onClick={() => {
        setError(''); void state.signOut(() => { menu.current?.removeAttribute('open'); void navigate(finderUrl(params)); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Couldn’t sign out.'));
      }}>Sign out</button>{error && <p role="alert">{error}</p>}
    </div></details> : <Link className={styles.signIn} to={`/sign-in?${new URLSearchParams({ returnTo: target })}`}>Sign in</Link>}
  </div>;
}
