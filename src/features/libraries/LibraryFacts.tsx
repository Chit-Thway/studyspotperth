import type { LibrarySearchResult } from '../../domain/library-search';
import type { RequirementMatch } from '../../domain/wifi';
import type { Institution } from '../../domain/search-context';
import { availabilityLabel, cardEntryLabel, coverageLabel, entryDayHoursLabel, matchLabel, openingDayLabel } from './presentation';
import { Icon } from './Icon';
import styles from './Libraries.module.css';

export function RequirementLabel({ requirement, match, group, label, hours }: { requirement: string; match: RequirementMatch; group?: Institution | 'unknown'; label?: string; hours?: string }) {
  const positive = match === 'public' || match === 'matches-profile';
  return <span className={`${styles.requirement} ${positive ? styles.matching : ''}`} data-group={group} title={`${label ? `${requirement} · ` : ''}${hours ? `Entry hours: ${hours} · ` : ''}${matchLabel(match)}`}>
    {positive ? <Icon name="check" /> : match === 'not-in-profile' ? <Icon name="close" /> : <span className={styles.requirementMark} aria-hidden="true">?</span>}
    <span>{label ?? requirement}{match === 'additional-requirements' && ' · approval required'}{match === 'unknown' && !/unknown/i.test(requirement) && ' · unknown'}<span className={styles.screenReaderOnly}> · {hours && `Entry hours: ${hours} · `}{matchLabel(match)}</span></span>
  </span>;
}

export function LibraryFacts({ result, compact = false }: { result: LibrarySearchResult; compact?: boolean }) {
  const coverage = coverageLabel(result);
  const qualifies = result.open24Hours.status === 'qualifies';
  const entries = qualifies ? compact
    ? [...result.access.requirements.filter((entry) => entry.group === 'public'), ...result.open24Hours.groups.filter((entry) => entry.group !== 'public')]
    : result.open24Hours.groups : result.access.requirements;
  const requirements = compact ? entries.filter((entry) => entry.group !== 'public' || cardEntryLabel(result, entry.group) !== undefined) : entries;
  return <div className={`${styles.facts} ${compact ? styles.cardFacts : ''}`}>
    {(compact || result.open24Hours.status === 'qualifies') && <div className={styles.roundTheClock} data-status={result.open24Hours.status}>
      <Icon name={result.open24Hours.status === 'does-not-qualify' ? 'close' : 'clock'} /><strong>{result.open24Hours.status === 'unknown' ? '24/7 unknown' : '24/7 access'}
        <span className={styles.screenReaderOnly}> · {qualifies ? 'available' : result.open24Hours.status === 'does-not-qualify' ? 'not available' : 'unconfirmed'}</span>
      </strong>
    </div>}
    <div className={styles.requirements}>{requirements.map((entry) => <RequirementLabel key={entry.group} group={entry.group} requirement={entry.requirement} match={entry.match}
      label={compact ? cardEntryLabel(result, entry.group) : undefined} hours={compact ? entryDayHoursLabel(result, entry.group) : undefined} />)}
      {!requirements.length && <RequirementLabel requirement="Entry requirements unknown" match="unknown" />}
    </div>
    <div className={styles.availability}><Icon name="clock" /><div><strong>{compact ? openingDayLabel(result) : availabilityLabel(result)}</strong>
      {coverage && <small>{coverage}</small>}
    </div></div>
  </div>;
}
