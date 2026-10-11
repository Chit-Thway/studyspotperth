import type { LibrarySearchResult } from '../../domain/library-search';
import type { RequirementMatch } from '../../domain/wifi';
import type { Institution } from '../../domain/search-context';
import { cardEntryLabel, entryDayHoursLabel, matchLabel, openingDayLabel } from './presentation';
import { Icon } from './Icon';
import styles from './Libraries.module.css';

export function RequirementLabel({ requirement, match, group, label, hours }: { requirement: string; match: RequirementMatch; group?: Institution | 'unknown'; label?: string; hours?: string }) {
  const positive = match === 'public' || match === 'matches-profile';
  return <span className={`${styles.requirement} ${positive ? styles.matching : ''}`} data-group={group} title={`${label ? `${requirement} · ` : ''}${hours ? `Entry hours: ${hours} · ` : ''}${matchLabel(match)}`}>
    {positive ? <Icon name="check" /> : match === 'not-in-profile' ? <Icon name="close" /> : <span className={styles.requirementMark} aria-hidden="true">?</span>}
    <span>{label ?? requirement}{match === 'additional-requirements' && ' · approval required'}{match === 'unknown' && !/unknown/i.test(requirement) && ' · unknown'}<span className={styles.screenReaderOnly}> · {hours && `Entry hours: ${hours} · `}{matchLabel(match)}</span></span>
  </span>;
}

export function LibraryEntryRequirements({ result }: { result: LibrarySearchResult }) {
  const public24Hours = result.open24Hours.groups.some((entry) => entry.group === 'public');
  const requirements = result.access.requirements.filter((entry) => (!public24Hours || entry.group === 'public')
    && (entry.group !== 'public' || cardEntryLabel(result, entry.group) !== undefined));
  return <div className={styles.requirements}>{requirements.map((entry) => <RequirementLabel key={entry.group} group={entry.group} requirement={entry.requirement} match={entry.match}
    label={cardEntryLabel(result, entry.group)} hours={entryDayHoursLabel(result, entry.group)} />)}
    {!requirements.length && <RequirementLabel requirement="Entry requirements unknown" match="unknown" />}
  </div>;
}

export function LibraryFacts({ result, compact = false, showBuildingHours = false }: { result: LibrarySearchResult; compact?: boolean; showBuildingHours?: boolean }) {
  const qualifies = result.open24Hours.status === 'qualifies';
  return <div className={`${styles.facts} ${compact ? styles.cardFacts : ''}`}>
    <div className={styles.roundTheClock} data-status={result.open24Hours.status}>
      <Icon name={result.open24Hours.status === 'does-not-qualify' ? 'close' : 'clock'} /><strong>{result.open24Hours.status === 'unknown' ? '24/7 unknown' : '24/7 access'}
        <span className={styles.screenReaderOnly}> · {qualifies ? 'available' : result.open24Hours.status === 'does-not-qualify' ? 'not available' : 'unconfirmed'}</span>
      </strong>
    </div>
    <LibraryEntryRequirements result={result} />
    <div className={styles.availability}><Icon name="clock" /><div><strong>{openingDayLabel(result, showBuildingHours)}</strong>
    </div></div>
  </div>;
}
