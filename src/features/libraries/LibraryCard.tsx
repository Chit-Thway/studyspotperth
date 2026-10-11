import { Link } from 'react-router-dom';
import type { LibrarySearchResult } from '../../domain/library-search';
import { finderUrl } from '../finder/finder-state';
import { Icon } from './Icon';
import { LibraryPhoto } from './LibraryPhoto';
import { LibraryFacts } from './LibraryFacts';
import { institutionCategory, mapsLocationUrl } from './presentation';
import styles from './Libraries.module.css';
import { SaveButton } from '../account/SaveButton';
import { LIBRARY_SIZES, LIBRARY_SIZE_LABELS } from '../../domain/library-size';

export function LibraryCard({ result, params }: { result: LibrarySearchResult; params: URLSearchParams }) {
  const { library } = result;
  const content = library.content;
  const href = finderUrl(params, `/libraries/${library.slug}`);
  const sizeIndex = LIBRARY_SIZES.findIndex((size) => size === content.size);
  return <article className={styles.card} aria-labelledby={`library-${library.id}`}>
    <div className={styles.cardHeading}><h3 id={`library-${library.id}`}><Link to={href}>{content.name}</Link></h3>
      <SaveButton id={library.id} name={content.name} /></div>
    <p className={styles.category}>{institutionCategory(library.institution)}</p>
    <p className={`${styles.location} ${styles.cardLocation}`}>
      <a className={styles.mapLink} href={mapsLocationUrl(result)} target="_blank" rel="noreferrer" title={content.address} aria-label={`${content.address} · Open in Google Maps`}>
        <Icon name="pin" /><span>{content.address}</span>
      </a>
      <span className={styles.distanceBadge}>{result.distanceKm !== null ? `approx. ${result.distanceKm.toFixed(1)} km` : 'Distance unknown'}</span>
    </p>
    <LibraryPhoto key={library.id} photos={content.photos} name={content.name} />
    <LibraryFacts result={result} compact showBuildingHours={params.get('openNow') === 'true'} />
    <ul className={styles.facilities} aria-label="Facilities">
      <li><Icon name="wifi" />{result.wifi.networks.some((network) => network.match === 'public') ? 'Public Wi-Fi' : result.wifi.networks.some((network) => network.kind === 'institution' || network.kind === 'eduroam') ? 'University Wi-Fi' : 'Wi-Fi'}</li>
      <li><Icon name="book" />{content.facilities.quietStudy === 'no' ? 'Study spaces' : 'Quiet areas'}</li>
      <li><Icon name={content.facilities.wheelchairAccess === 'yes' ? 'access' : 'people'} />{content.facilities.wheelchairAccess === 'yes' ? 'Step-free access' : content.facilities.groupStudy === 'no' ? 'Shared spaces' : 'Group spaces'}</li>
    </ul>
    <div className={styles.librarySize} role="group" aria-label={`Estimated Study Space: ${content.size ? LIBRARY_SIZE_LABELS[content.size] : 'Unknown'}`} title="Estimated usable study-space scale">
      <p className={styles.sizeHeading}><Icon name="desk" />Estimated Study Space{sizeIndex < 0 && <span className={styles.sizeUnknown}>Unknown</span>}</p>
      <ol className={styles.sizeScale} aria-hidden="true">
        {LIBRARY_SIZES.map((size, index) => <li key={size} data-filled={index <= sizeIndex} data-current={index === sizeIndex}>
          <span className={styles.sizeBar} />
          <span>{LIBRARY_SIZE_LABELS[size]}</span>
        </li>)}
      </ol>
    </div>
    <Link className={styles.viewLink} to={href}>View library <Icon name="arrow" /></Link>
  </article>;
}
