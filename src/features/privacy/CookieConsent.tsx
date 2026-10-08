import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cookieChoice, visitorId, type CookieChoice } from '../../domain/privacy';
import { formatPerthTime } from '../../domain/perth-time';
import { useAccount } from '../account/use-account';
import { ensureVisitorCookie, recordUsage, saveCookieChoice } from './client';
import styles from './Privacy.module.css';

export function CookieConsent() {
  const [choice, setChoice] = useState(() => cookieChoice(document.cookie));
  const [day, setDay] = useState(() => formatPerthTime(Date.now()).slice(0, 10));
  const dialog = useRef<HTMLDialogElement>(null);
  const settings = useRef<HTMLButtonElement>(null);
  const { pathname, search } = useLocation();
  const { account, loading, error } = useAccount();
  const recorded = useRef(new Set<string>());
  useEffect(() => {
    const sync = () => { setChoice(cookieChoice(document.cookie)); if (document.visibilityState === 'visible') setDay(formatPerthTime(Date.now()).slice(0, 10)); };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    if (!cookieChoice(document.cookie)) dialog.current?.showModal();
    return () => { window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  useEffect(() => {
    if (choice !== 'accepted' || loading || error || pathname.startsWith('/admin') || pathname === '/sign-in') return;
    ensureVisitorCookie();
    const visitor = visitorId(document.cookie);
    if (!visitor) return;
    const key = `${account?.user.id ?? visitor}:${formatPerthTime(Date.now()).slice(0, 10)}`;
    if (recorded.current.has(key)) return;
    recorded.current.add(key);
    void recordUsage('visit').then((ok) => { if (!ok) recorded.current.delete(key); });
  }, [choice, loading, error, account?.user.id, pathname, search, day]);
  function choose(next: CookieChoice) {
    saveCookieChoice(next); setChoice(next);
    dialog.current?.close(); settings.current?.focus({ preventScroll: true });
  }
  return <>
    <button ref={settings} className={styles.settings} type="button" onClick={() => dialog.current?.showModal()}>Cookie settings</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="cookie-title" aria-describedby="cookie-description" onCancel={() => choose('essential')}>
      <h2 id="cookie-title">Your cookie choice</h2>
      <p id="cookie-description">Essential cookies keep sign-in working. Optional cookies help us measure visits and directions clicks.</p>
      <p className={styles.note}>Location permission is separate. Your approximate location is remembered when allowed.</p>
      <div className={styles.actions}><button type="button" onClick={() => choose('essential')}>Essential only</button><button className={styles.accept} type="button" onClick={() => choose('accepted')}>Accept optional cookies</button></div>
    </dialog>
  </>;
}
