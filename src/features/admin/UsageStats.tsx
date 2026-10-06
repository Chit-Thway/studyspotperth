import type { UsageSummary } from '../../domain/privacy';
import { useLibraryApi } from '../libraries/use-library-api';
import styles from './Admin.module.css';

export function UsageStats() {
  const resource = useLibraryApi<UsageSummary>('/api/admin/usage');
  return <section className={styles.section} aria-labelledby="usage-title"><h2 id="usage-title">Usage · last 30 days</h2>
    {resource.loading && <p role="status">Loading statistics…</p>}
    {resource.error && <p role="alert">Statistics couldn’t load. <button type="button" className={styles.secondary} onClick={resource.retry}>Try again</button></p>}
    {resource.data && <><dl className={styles.usageStats}>{resource.data.actors.map((actor) => <div key={actor.kind}><dt>{actor.kind === 'account' ? 'Active accounts' : 'Estimated guest browsers'}</dt><dd>{actor.active}<small>{actor.returning} returning</small></dd></div>)}
      <div><dt>Directions clicks</dt><dd>{resource.data.directionsClicks}</dd></div><div><dt>Current favourites</dt><dd>{resource.data.favourites}</dd></div></dl>
      <p className={styles.note}>Visits and directions include users who accept optional cookies. Returning means activity on more than one day in the last 90 days. Guest browsers are estimates; clearing cookies or changing devices changes the count.</p></>}
  </section>;
}
