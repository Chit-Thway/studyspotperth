import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SearchResponse } from '../libraries/api';
import { LibraryPhoto } from '../libraries/LibraryPhoto';
import { LibraryFacts } from '../libraries/LibraryFacts';
import { Icon } from '../libraries/Icon';
import { finderUrl } from './finder-state';
import { useUserLocation } from '../location/use-location';
import styles from '../location/Map.module.css';

const SpotMap = lazy(() => import('../location/SpotMap'));
export function LibraryMap({ result, params }: { result: SearchResponse; params: URLSearchParams }) {
  const { isCustom } = useUserLocation();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = result.results.find((item) => item.library.id === selectedId);
  const missing = result.results.filter(({ library }) => library.content.latitude === null || library.content.longitude === null).length;
  return <div className={styles.explorer}>
    <div className={styles.explorerMap}><Suspense fallback={<div className={styles.loading}>Loading your surroundings…</div>}><SpotMap origin={result.request.origin} customOrigin={isCustom} results={result.results} selectedId={selected?.library.id} onSelect={setSelectedId} /></Suspense></div>
    <div className={styles.legend} aria-label="Building opening status"><span><i className={styles.openDot} />Open</span><span><i className={styles.closedDot} />Closed</span><span><i className={styles.unknownDot} />Hours unknown</span></div>
    {selected ? <article className={styles.preview} aria-label={selected.library.content.name}>
      <button className={styles.previewClose} type="button" aria-label="Close library preview" onClick={() => setSelectedId(undefined)}><Icon name="close" /></button>
      <LibraryPhoto photos={selected.library.content.photos} name={selected.library.content.name} />
      <div className={styles.previewBody}><span className={styles.previewStatus}>{selected.opening.status === 'open' ? 'Building open' : selected.opening.status === 'closed' ? 'Building closed' : 'Hours unknown'}{selected.distanceKm !== null && ` · ${selected.distanceKm.toFixed(1)} km away`}</span>
        <h3>{selected.library.content.name}</h3><p>{selected.library.content.address}</p><LibraryFacts result={selected} compact showBuildingHours />
        <Link className={styles.primaryButton} to={finderUrl(params, `/libraries/${selected.library.slug}`)}>View library <Icon name="arrow" /></Link>
      </div>
    </article> : <div className={styles.explorerHint}><Icon name="pin" /><span>Select a library to explore its hours and access.</span></div>}
    {missing > 0 && <p className={styles.missing}>{missing} {missing === 1 ? 'library has' : 'libraries have'} no map coordinates. Available in list view.</p>}
  </div>;
}
