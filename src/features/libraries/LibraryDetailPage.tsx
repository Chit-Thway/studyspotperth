import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { CalendarSchedule } from '../../domain/schedule';
import { shiftDate } from '../../domain/perth-time';
import type { DetailResponse } from './api';
import { LibraryApiError } from './api';
import { useLibraryApi } from './use-library-api';
import { finderUrl, queryUrl } from '../finder/finder-state';
import { LibraryPhoto, LibraryPhotoCredits } from './LibraryPhoto';
import { LibraryFacts, LibraryEntryRequirements } from './LibraryFacts';
import { Icon } from './Icon';
import { weeklyOpeningHours, directionsUrl, institutionCategory, INSTITUTION_LABELS, matchLabel, readableDate } from './presentation';
import styles from './Libraries.module.css';
import { profileFinderParams } from '../../domain/account';
import { useAccount } from '../account/use-account';
import { SaveButton } from '../account/SaveButton';
import type { LibrarySearchResult } from '../../domain/library-search';
import { recordUsage } from '../privacy/client';
import { useUserLocation } from '../location/use-location';

function HoursTable({ schedule, building, label }: { schedule: CalendarSchedule; building: CalendarSchedule; label: string }) {
  return <table className={styles.hoursTable}><caption>{label}</caption><tbody>
    {weeklyOpeningHours(schedule, building).map(({ day, hours }) => <tr key={day}><th scope="row">{day}</th><td>{hours}</td></tr>)}
  </tbody></table>;
}

export function LibraryDetailPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { account } = useAccount();
  const effective = profileFinderParams(params, account?.preferences);
  const location = useUserLocation();
  const resource = useLibraryApi<DetailResponse>(queryUrl(effective, `/api/libraries/${encodeURIComponent(slug)}`), !effective.has('start'), location.coordinates, location.ready);
  const result = resource.data?.result;
  useEffect(() => { document.title = result ? `${result.library.content.name} · StudySpot Perth` : 'Library details · StudySpot Perth'; }, [result]);
  const back = finderUrl(params);
  if (!result) return <section className={styles.detail}>
    <Link className={styles.backLink} to={back}>← All libraries</Link>
    <div className={styles.statePanel} role={resource.error ? 'alert' : 'status'}>
      <Icon name="book" /><h1>{resource.loading ? 'Loading library…' : resource.error instanceof LibraryApiError && resource.error.status === 404 ? 'Library not available' : 'Couldn’t load this library'}</h1>
      <p>{resource.loading ? 'Checking its hours and entry information.' : resource.error?.message}</p>
      {resource.error && !(resource.error instanceof LibraryApiError && resource.error.status === 404) && <button className={styles.actionButton} type="button" onClick={resource.retry}>Try again</button>}
    </div>
  </section>;
  return <><LibraryDetailContent result={result} originName={resource.data?.request.origin.name} back={back} />
    {resource.error && <p className={styles.disclaimer} role="alert">Couldn’t refresh this library. Showing the last checked information; current hours may have changed. <button className={styles.actionButton} type="button" onClick={resource.retry}>Try again</button></p>}
  </>;
}

/** Shared public/detail preview presentation; previews omit visitor save actions. */
export function LibraryDetailContent({ result, originName, back, preview = false }: { result: LibrarySearchResult; originName?: string; back?: string; preview?: boolean }) {
  const { content, institution } = result.library;
  const publicEntry = content.schedule.access.find((entry) => entry.group === 'public');
  const photoSourceIds = new Set(content.photos.filter((photo) => photo.credit && photo.sourceId).flatMap((photo) => [photo.sourceId, `${photo.sourceId}-license`]));
  return <article className={styles.detail}>
    {back && <Link className={styles.backLink} to={back}>← All libraries</Link>}
    <LibraryPhoto key={result.library.id} photos={content.photos} name={content.name} large />
    <div className={styles.detailHeading}><div><p className={styles.category}>{institutionCategory(institution)}</p><h1>{content.name}</h1></div>
      {!preview && <SaveButton id={result.library.id} name={content.name} label />}</div>
    <p className={styles.location}><Icon name="pin" /><span>{content.address}{result.distanceKm !== null ? ` · approx. ${result.distanceKm.toFixed(1)} km${originName === 'Your location' ? ' from you' : ''}` : ' · distance unknown'}</span></p>
    <LibraryFacts result={result} />
    <p className={styles.description}>{content.description}</p>
    <div className={styles.detailColumns}>
      <section className={styles.panel} aria-labelledby="hours-title"><h2 id="hours-title"><Icon name="clock" />Opening and entry hours</h2><p className={styles.disclaimer}>Perth time</p>
        <HoursTable schedule={publicEntry ?? content.schedule.building} building={content.schedule.building} label={publicEntry ? 'Public opening hours' : 'Opening hours'} />
        {content.schedule.access.filter((entry) => entry.group !== 'public').map((entry) => <details className={styles.entryHours} key={entry.group}><summary>{entry.group === 'unknown' ? 'Unknown entry group' : `${INSTITUTION_LABELS[entry.group]} card access`}</summary>
          <p>{entry.requirement}{entry.needsActiveCredentials ? ' · Active credentials required.' : ''}</p>
          <HoursTable schedule={entry} building={content.schedule.building} label="Card access hours" /></details>)}
      </section>
      <div className={styles.sidePanels}>
        <section className={styles.panel} aria-labelledby="wifi-title"><h2 id="wifi-title"><Icon name="wifi" />Wi-Fi</h2>
          {content.wifi.status === 'unknown' || !result.wifi.networks.length ? <p>Wi-Fi unknown</p> : result.wifi.networks.map((network, index) => <div className={styles.network} key={`${network.name}-${index}`}><h3>{network.name}</h3><p className={styles.networkType} title={matchLabel(network.match)}>{network.kind === 'eduroam' ? 'eduroam' : network.kind.replaceAll('-', ' ')}<span className={styles.screenReaderOnly}> · {matchLabel(network.match)}</span></p><p>{network.requirements}</p>
            {network.needsActiveCredentials && <p>Active login required</p>}
            {network.limits && <p>{network.limits}</p>}{network.helpUrl && <a href={network.helpUrl} target="_blank" rel="noreferrer">Connection help ↗</a>}</div>)}
        </section>
        <section className={styles.panel} aria-labelledby="facilities-title"><h2 id="facilities-title">Facilities</h2><dl className={styles.facilityDetails}>
          {([['quietStudy', 'Quiet areas', 'book'], ['groupStudy', 'Group spaces', 'people'], ['wheelchairAccess', 'Step-free access', 'access']] as const).map(([key, label, icon]) => <div key={key}><dt><Icon name={icon} className={styles.facilityIcon} />{label}</dt><dd>{content.facilities[key] === 'yes' ? 'Available' : content.facilities[key] === 'no' ? 'Not available' : 'Unknown'}</dd></div>)}
        </dl></section>
        <a className={styles.directions} href={directionsUrl(result)} target="_blank" rel="noreferrer" aria-label="Directions in Google Maps" onClick={() => { if (!preview) void recordUsage('directions', result.library.id); }}><Icon name="pin" />Directions ↗</a>
        {content.officialUrl && <a className={styles.externalLink} href={content.officialUrl} target="_blank" rel="noreferrer">Official library website ↗</a>}
      </div>
    </div>
    <section className={styles.panel} aria-labelledby="access-title"><h2 id="access-title">Entry and 24/7</h2>
      <LibraryEntryRequirements result={result} />
      <p className={styles.disclaimer}>Cards are self-reported; entry conditions apply.</p>
      {result.open24Hours.status === 'qualifies' ? result.open24Hours.groups.map((group) => <p key={group.group}>24/7 access: {group.requirement}. Checked for {readableDate(group.verifiedFrom)}–{readableDate(shiftDate(group.verifiedUntil.slice(0, 10), -1))}.{group.needsActiveCredentials ? ' Active credentials are required.' : ''}</p>) : <p>24/7 access {result.open24Hours.status === 'unknown' ? 'is unknown' : 'is not confirmed for the selected period'}.</p>}
      <p className={styles.disclaimer}>Checked until the start of {readableDate(result.evaluatedUntil)}. Later dates may differ.</p>
      {result.exceptions.filter((item) => item.overrides.length).map((item) => <div key={item.group}><h3>{item.group === 'building' ? 'Building' : item.group === 'public' ? 'Public entry' : item.group === 'unknown' ? 'Unknown entry' : `${INSTITUTION_LABELS[item.group]} entry`} changes</h3>
        <ul className={styles.exceptions}>{item.overrides.map((override) => <li key={override.id}><strong>{readableDate(override.startDate)}{override.endDate !== override.startDate ? `–${readableDate(override.endDate)}` : ''}</strong> · {override.status === 'closed' ? 'Closed' : override.status === 'unknown' ? 'Hours unknown' : 'Replacement hours apply'}</li>)}</ul></div>)}
    </section>
    <section className={styles.sources} aria-labelledby="sources-title"><h2 id="sources-title">Sources and checked dates</h2>
      {!content.sources.length && <p>Source information is not available.</p>}
      <ul>{content.sources.filter((source) => !photoSourceIds.has(source.id)).map((source) => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> : source.label}{source.checkedOn ? ` · checked ${readableDate(source.checkedOn)}` : ' · checked date unknown'}</li>)}
        <LibraryPhotoCredits photos={content.photos} sources={content.sources} />
      </ul>
    </section>
  </article>;
}
