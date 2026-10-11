import { formatPerthTime } from '../../domain/perth-time';
import { UNIVERSITY_CARDS, INSTITUTION_LABELS } from '../libraries/presentation';
import { resetFinderFilters, toggleFinderSelection, updateFinderParam } from './finder-state';
import styles from './FinderPage.module.css';
import { LocationControl } from '../location/LocationControl';
import { LIBRARY_SIZES, LIBRARY_SIZE_LABELS } from '../../domain/library-size';
import { Icon } from '../libraries/Icon';
import type { IconName } from '../libraries/Icon';

const sizeIcons: Record<typeof LIBRARY_SIZES[number], IconName> = { small: 'person', medium: 'people', large: 'crowd' };

export interface FilterPanelProps {
  params: URLSearchParams;
  change: (params: URLSearchParams) => void;
  prefix: string;
}
export function FilterPanel({ params, change, prefix }: FilterPanelProps) {
  const institutions = (params.get('institutions') ?? '').split(',');
  const sizes = (params.get('sizes') ?? '').split(',');
  const update = (field: string, value: string | null) => change(updateFinderParam(params, field, value));
  const start = params.get('start');
  const selectedTime = start !== null;
  const openNow = params.get('openNow') === 'true';
  const startDate = start?.split('T')[0] ?? '';
  const startTime = start?.split('T')[1] ?? '';
  return <>
    <div className={styles.filterHeader}><h2>Filters</h2><button type="button" onClick={() => change(resetFinderFilters(params))}>Clear all</button></div>
    <div className={styles.filterFields}>
      <div className={styles.filterSection}><span className={styles.fieldLabel}>Location</span><LocationControl /></div>
      <div className={styles.filterSection}><span className={styles.fieldLabel} id={`${prefix}-when-label`}>When</span>
        <div className={styles.timeMode} role="group" aria-labelledby={`${prefix}-when-label`}>
          <button className={openNow ? styles.selectedMode : ''} type="button" aria-pressed={openNow} onClick={() => update('openNow', openNow ? null : 'true')}>Open now</button>
          <button className={selectedTime ? styles.selectedMode : ''} type="button" aria-pressed={selectedTime} onClick={() => update('start', formatPerthTime(Date.now()).slice(0, 16))}>Choose a time</button>
        </div><p className={styles.help}>Perth time</p>
        {selectedTime && <div className={styles.timeFields}>
          <label className={styles.smallLabel} htmlFor={`${prefix}-start-date`}>Date<input type="date" id={`${prefix}-start-date`} min="2000-01-01" max="2100-12-31" required value={startDate} onChange={(event) => update('start', `${event.target.value}T${startTime || '09:00'}`)} /></label>
          <label className={styles.smallLabel} htmlFor={`${prefix}-start-time`}>Time<input type="time" id={`${prefix}-start-time`} required value={startTime} onChange={(event) => update('start', `${startDate}T${event.target.value}`)} /></label>
        </div>}
      </div>
      <div className={styles.filterSection}>
        <label className={styles.switchRow}><input type="checkbox" role="switch" checked={params.get('open24Hours') === 'true'} onChange={(event) => update('open24Hours', event.target.checked ? 'true' : null)} /><span className={styles.switchTrack} aria-hidden="true" /><span><strong>Open 24/7</strong></span></label>
        <label className={styles.switchRow}><input type="checkbox" role="switch" checked={params.get('usableWifi') === 'true'} onChange={(event) => update('usableWifi', event.target.checked ? 'true' : null)} /><span className={styles.switchTrack} aria-hidden="true" /><span><strong>Wi-Fi I can use</strong></span></label>
      </div>
      <fieldset className={styles.filterSection}><legend className={styles.fieldLabel}>Access</legend>
        <label className={styles.checkboxRow}><input type="checkbox" checked={params.get('publicAccess') === 'true'} onChange={(event) => update('publicAccess', event.target.checked ? 'true' : null)} />Public access</label>
      </fieldset>
      <fieldset className={styles.filterSection}><legend className={styles.fieldLabel}>Institution</legend><p className={styles.help}>All unless selected</p>
        {UNIVERSITY_CARDS.map((institution) => <label className={styles.checkboxRow} key={institution}><input type="checkbox" checked={institutions.includes(institution)} onChange={() => change(toggleFinderSelection(params, 'institutions', institution))} />{INSTITUTION_LABELS[institution]}</label>)}
      </fieldset>
      <fieldset className={styles.filterSection}><legend className={styles.fieldLabel}>Size</legend>
        <div className={styles.sizeOptions}>{LIBRARY_SIZES.map((size) => <button type="button" key={size}
          aria-label={`${LIBRARY_SIZE_LABELS[size]} libraries`} title={`${LIBRARY_SIZE_LABELS[size]} · estimated study-space size`}
          aria-pressed={sizes.includes(size)} onClick={() => change(toggleFinderSelection(params, 'sizes', size))}>
          <Icon name={sizeIcons[size]} />
        </button>)}</div>
      </fieldset>
      <fieldset className={styles.filterSection}><legend className={styles.fieldLabel}>Study environment</legend>
        {([['quietStudy', 'Quiet study areas'], ['groupStudy', 'Group study areas'], ['wheelchairAccess', 'Step-free access']] as const).map(([field, label]) => <label className={styles.checkboxRow} key={field}><input type="checkbox" checked={params.get(field) === 'true'} onChange={(event) => update(field, event.target.checked ? 'true' : null)} />{label}</label>)}
      </fieldset>
    </div>
  </>;
}
