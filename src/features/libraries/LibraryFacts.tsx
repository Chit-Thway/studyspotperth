import type { LibrarySearchResult } from '../../domain/library-search';
import type { RequirementMatch } from '../../domain/wifi';
import { availabilityLabel, coverageLabel, matchLabel } from './presentation';
import { Icon } from './Icon';
import styles from './Libraries.module.css';

export function RequirementLabel({ requirement, match }: { requirement: string; match: RequirementMatch }) {
  const positive = match === 'public' || match === 'matches-profile';
  return <span className={`${styles.requirement} ${positive ? styles.matching : ''}`} title={matchLabel(match)}>
    {positive ? <Icon name="check" /> : match === 'not-in-profile' ? <Icon name="close" /> : <span className={styles.requirementMark} aria-hidden="true">?</span>}
    <span>{requirement}{match === 'additional-requirements' && ' · approval required'}{match === 'unknown' && !/unknown/i.test(requirement) && ' · unknown'}<span className={styles.screenReaderOnly}> · {matchLabel(match)}</span></span>
  </span>;
}

export function LibraryFacts({ result, compact = false }: { result: LibrarySearchResult; compact?: boolean }) {
  const coverage = coverageLabel(result);
  const requirements = result.open24Hours.status === 'qualifies' ? result.open24Hours.groups : result.access.requirements;
  const hasExceptions = result.exceptions.some((item) => item.overrides.length > 0);
  return <div className={styles.facts}>
    {result.open24Hours.status === 'qualifies' && <div className={styles.roundTheClock}><Icon name="clock" /><strong>24/7 access</strong></div>}
    <div className={styles.requirements}>{requirements.map((entry) => <RequirementLabel key={entry.group} requirement={entry.requirement} match={entry.match} />)}
      {!requirements.length && <RequirementLabel requirement="Entry requirements unknown" match="unknown" />}</div>
    {compact && result.open24Hours.status === 'qualifies' && result.access.requirements.some((entry) => entry.group === 'public' && entry.openAtStart === true)
      && !result.open24Hours.groups.some((group) => group.group === 'public') && <p className={styles.disclaimer}>Public entry at this time</p>}
    <div className={styles.availability}><Icon name="clock" /><div><strong>{availabilityLabel(result)}</strong>
      {coverage && <small>{coverage}</small>}
    </div></div>
    {hasExceptions && <p className={styles.conditions}>Hours vary by date</p>}
  </div>;
}
