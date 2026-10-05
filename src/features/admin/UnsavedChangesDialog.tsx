import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import styles from './Admin.module.css';

export function UnsavedChangesDialog({ shouldBlock }: { shouldBlock: () => boolean }) {
  const blocker = useBlocker(shouldBlock);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (blocker.state === 'blocked') dialog.current?.showModal();
    else dialog.current?.close();
  }, [blocker.state]);

  return <dialog ref={dialog} className={styles.confirmation} aria-labelledby="unsaved-title" aria-describedby="unsaved-description"
    onCancel={(event) => { event.preventDefault(); if (blocker.state === 'blocked') blocker.reset(); }}>
    <h2 id="unsaved-title">Unsaved changes</h2>
    <p id="unsaved-description">Leave this editor and discard your unsaved changes?</p>
    <div className={styles.actions}>
      <button type="button" className={styles.button} autoFocus onClick={() => { if (blocker.state === 'blocked') blocker.reset(); }}>Keep editing</button>
      <button type="button" className={styles.secondary} onClick={() => { if (blocker.state === 'blocked') blocker.proceed(); }}>Discard changes</button>
    </div>
  </dialog>;
}
