import { useUserLocation } from './use-location';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LocationPicker } from './LocationPicker';
import { Icon } from '../libraries/Icon';
import styles from './Map.module.css';

export function LocationControl() {
  const state = useUserLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { dialog.current?.close(); setOpen(false); };
  return <div className={styles.locationCard}>
    <div className={styles.locationSummary}><Icon name="pin" /><span><small>SEARCHING AROUND</small><strong>{state.label ?? 'Perth CBD'}</strong></span></div>
    <button className={styles.deviceButton} type="button" disabled={state.loading} onClick={state.request}>{state.loading ? 'Finding location…' : 'Use my location'}</button>
    <button className={styles.customButton} type="button" onClick={() => { setOpen(true); dialog.current?.showModal(); }}>Custom location <Icon name="arrow" /></button>
    {state.coordinates && <button className={styles.resetLocation} type="button" onClick={state.clear}>Reset location</button>}
    {state.error && <p className={styles.locationError} role="status">{state.error}</p>}
    {createPortal(<dialog ref={dialog} className={styles.locationDialog} aria-label="Choose a custom location" onCancel={close} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      {open && <LocationPicker initial={state.coordinates} onClose={close} onChoose={(point, label) => { state.setCustom?.(point, label); close(); }} />}
    </dialog>, document.body)}
  </div>;
}
