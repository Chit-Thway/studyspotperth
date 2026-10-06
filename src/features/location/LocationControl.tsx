import { useUserLocation } from './use-location';
import styles from '../finder/FinderPage.module.css';

export function LocationControl() {
  const state = useUserLocation();
  return <div><button className={styles.locationButton} type="button" disabled={state.loading} onClick={state.request}>{state.loading ? 'Finding location…' : state.coordinates ? 'Update my location' : 'Use my location'}</button>
    {(state.coordinates || state.loading) && <button className={styles.textButton} type="button" onClick={state.clear}>Turn off location</button>}
    {state.error && <p className={styles.help} role="status">{state.error}</p>}
  </div>;
}
