import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useAccount } from '../account/use-account';
import styles from './Admin.module.css';

export function UnsavedChangesDialog({ shouldBlock }: { shouldBlock: () => boolean }) {
  const confirmedAction = useRef(false);
  const blocker = useBlocker(() => !confirmedAction.current && shouldBlock());
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingSignOut = useRef<((confirmed: boolean) => void) | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const { registerSignOutGuard } = useAccount();

  useEffect(() => registerSignOutGuard(async (action) => {
    if (!shouldBlock()) return action();
    const confirmed = await new Promise<boolean>((resolve) => { pendingSignOut.current = resolve; setSigningOut(true); });
    if (!confirmed) return;
    // Keep the explicit discard decision active through logout and its redirect.
    confirmedAction.current = true;
    try { await action(); } finally { confirmedAction.current = false; }
  }), [registerSignOutGuard, shouldBlock]);
  useEffect(() => () => { pendingSignOut.current?.(false); }, []);

  function decide(confirmed: boolean) {
    if (pendingSignOut.current) {
      const resolve = pendingSignOut.current; pendingSignOut.current = null;
      setSigningOut(false); resolve(confirmed);
    } else if (blocker.state === 'blocked') {
      if (confirmed) blocker.proceed(); else blocker.reset();
    }
  }

  useEffect(() => {
    if (blocker.state === 'blocked' || signingOut) dialog.current?.showModal();
    else dialog.current?.close();
  }, [blocker.state, signingOut]);

  return <dialog ref={dialog} className={styles.confirmation} aria-labelledby="unsaved-title" aria-describedby="unsaved-description"
    onCancel={(event) => { event.preventDefault(); decide(false); }}>
    <h2 id="unsaved-title">Unsaved changes</h2>
    <p id="unsaved-description">{signingOut ? 'Sign out and discard your unsaved changes?' : 'Leave this editor and discard your unsaved changes?'}</p>
    <div className={styles.actions}>
      <button type="button" className={styles.button} autoFocus onClick={() => { decide(false); }}>Keep editing</button>
      <button type="button" className={styles.secondary} onClick={() => { decide(true); }}>Discard changes</button>
    </div>
  </dialog>;
}
