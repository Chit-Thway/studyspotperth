import { Link } from 'react-router-dom';
import type { LibrarySearchResult } from '../../domain/library-search';
import { finderUrl } from '../finder/finder-state';
import { Icon } from './Icon';
import { LibraryPhoto } from './LibraryPhoto';
import { LibraryFacts } from './LibraryFacts';
import { institutionCategory } from './presentation';
import styles from './Libraries.module.css';

export function LibraryCard({ result, params }: { result: LibrarySearchResult; params: URLSearchParams }) {
  const { library } = result;
  const content = library.content;
  const href = finderUrl(params, `/libraries/${library.slug}`);
  return <article className={styles.card} aria-labelledby={`library-${library.id}`}>
    <div className={styles.cardHeading}><h3 id={`library-${library.id}`}><Link to={href}>{content.name}</Link></h3>
      <button className={styles.saveButton} type="button" disabled aria-label={`Save ${content.name} (accounts coming later)`} title="Saving libraries will be available with accounts"><Icon name="heart" /></button></div>
    <p className={styles.category}>{institutionCategory(library.institution)}</p>
    <p className={styles.location}><Icon name="pin" /><span>{content.address}{result.distanceKm !== null ? ` · approx. ${result.distanceKm.toFixed(1)} km` : ' · distance unknown'}</span></p>
    <LibraryPhoto key={library.id} photos={content.photos} name={content.name} />
    <LibraryFacts result={result} compact />
    <ul className={styles.facilities} aria-label="Facilities">
      {(content.facilities.quietStudy === 'yes' || content.facilities.groupStudy === 'yes') && <li><Icon name={content.facilities.quietStudy === 'yes' ? 'book' : 'people'} />{content.facilities.quietStudy === 'yes' ? content.facilities.groupStudy === 'yes' ? 'Quiet + group' : 'Quiet areas' : 'Group spaces'}</li>}
      {result.wifi.status === 'eligible' && <li><Icon name="wifi" />{result.wifi.networks.some((network) => network.match === 'public') ? 'Public Wi-Fi' : 'Wi-Fi'}</li>}
      {content.facilities.wheelchairAccess === 'yes' && <li><Icon name="access" />Step-free access</li>}
    </ul>
    <Link className={styles.viewLink} to={href}>View library <Icon name="arrow" /></Link>
  </article>;
}
