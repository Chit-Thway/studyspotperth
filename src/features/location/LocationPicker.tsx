import { lazy, Suspense, useState } from 'react';
import type { Coordinates } from '../../domain/location';
import { DEFAULT_ORIGIN } from '../../domain/search-request';
import { usePublicCatalogue } from '../libraries/catalogue-context';
import { Icon } from '../libraries/Icon';
import styles from './Map.module.css';

const SpotMap = lazy(() => import('./SpotMap'));
export function LocationPicker({ initial, onChoose, onClose }: { initial: Coordinates | null; onChoose: (point: Coordinates, label: string) => void; onClose: () => void }) {
  const { data } = usePublicCatalogue();
  const [query, setQuery] = useState('');
  const [point, setPoint] = useState(initial ?? DEFAULT_ORIGIN);
  const [label, setLabel] = useState(initial ? 'Dropped pin' : 'Perth CBD');
  const locations = [ ...(data?.origins ?? []).map((origin) => ({ ...origin, detail: 'Suburb' })),
    ...(data?.libraries ?? []).flatMap(({ id, content }) => content.latitude !== null && content.longitude !== null
      ? [{ id, name: content.name, detail: content.address, latitude: content.latitude, longitude: content.longitude }] : []) ];
  const matches = query.trim() ? locations.filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];
  return <div className={styles.pickerBody}>
    <div className={styles.pickerHeading}><div><h2>Where will you study?</h2><p>Choose a starting point to find libraries nearby.</p></div><button className={styles.closeButton} type="button" aria-label="Close location picker" onClick={onClose}><Icon name="close" /></button></div>
    <label className={styles.searchLabel}>Search a suburb, library or library address
      <span className={styles.searchInput}><Icon name="pin" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Fremantle or Joondalup" /></span>
    </label>
    {query.trim() && <div className={styles.suggestions} aria-label="Matching locations">
      {matches.map((item) => <button key={item.id} type="button" onClick={() => { setPoint({ latitude: item.latitude, longitude: item.longitude }); setLabel(item.name); setQuery(''); }}><Icon name="pin" /><span><strong>{item.name}</strong><small>{item.detail}</small></span><Icon name="arrow" /></button>)}
      {!matches.length && <p>No matching suburb or library. Place a pin on the map below.</p>}
    </div>}
    <div className={styles.pickerMap}><Suspense fallback={<div className={styles.loading}>Loading map…</div>}><SpotMap origin={point} onPick={(next) => { setPoint(next); setLabel('Dropped pin'); }} /></Suspense></div>
    <div className={styles.pickerFooter}><div><strong><Icon name="pin" />{label}</strong><small>{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</small></div><button type="button" className={styles.primaryButton} onClick={() => onChoose(point, label)}>Use this location <Icon name="arrow" /></button></div>
  </div>;
}
