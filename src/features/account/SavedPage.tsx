import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { profileFinderParams } from '../../domain/account';
import { finderUrl } from '../finder/finder-state';
import { LibraryCard } from '../libraries/LibraryCard';
import { useSavedLibraries } from '../libraries/use-catalogue-search';
import { AccountGate } from './AccountGate';
import { useAccount } from './use-account';
import styles from './AccountPages.module.css';
import { savedQuery } from './saved-query';
import { useUserLocation } from '../location/use-location';

function SavedLibraries() {
  const { account } = useAccount();
  const [raw] = useSearchParams();
  const effective = profileFinderParams(raw, account?.preferences);
  const { params } = savedQuery(effective);
  const location = useUserLocation();
  const resource = useSavedLibraries(account?.favouriteIds ?? [], params.toString(), location.coordinates, location.ready);
  const results = resource.data?.results.filter((result) => account?.favouriteIds.includes(result.library.id));
  return <section className={styles.savedPage}><Link className={styles.back} to={finderUrl(raw)}>← Libraries</Link><h1>Saved libraries</h1>
    {resource.loading && <p role="status">Loading saved libraries…</p>}
    {resource.error && <p role="alert">{resource.error.message} <button type="button" onClick={resource.retry}>Try again</button></p>}
    {results?.length === 0 && <div className={styles.panel}><p>No saved libraries yet.</p><Link to={finderUrl(raw)}>Find a study spot →</Link></div>}
    {results && results.length > 0 && <div className={styles.grid}>{results.map((result) => <LibraryCard key={result.library.id} result={result} params={raw} />)}</div>}
  </section>;
}
export function SavedPage() {
  const { account } = useAccount();
  useEffect(() => { document.title = 'Saved libraries · StudySpot Perth'; }, []);
  return <AccountGate>{account && <SavedLibraries key={account.user.id} />}</AccountGate>;
}
