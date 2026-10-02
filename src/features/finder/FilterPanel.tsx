import type { SearchOrigin } from '../../domain/search-request';
import { formatPerthTime } from '../../domain/perth-time';
import { INSTITUTIONS, INSTITUTION_LABELS } from '../libraries/presentation';
import { resetFinderFilters, toggleFinderSelection, updateFinderParam } from './finder-state';
import styles from './FinderPage.module.css';

export interface FilterPanelProps {
  params: URLSearchParams;
  origins: SearchOrigin[];
  change: (params: URLSearchParams) => void;
  prefix: string;
}
export function FilterPanel({ params, origins, change, prefix }: FilterPanelProps) {
  const institutions = (params.get('institutions') ?? '').split(',');
  const update = (field: string, value: string | null) => change(updateFinderParam(params, field, value));
  const start = params.get('start');
  const selectedTime = start !== null;
  const startDate = start?.split('T')[0] ?? '';
  const startTime = start?.split('T')[1] ?? '';
  return <>
    <div className={styles.filterHeader}><h2>Filters</h2><button type="button" onClick={() => change(resetFinderFilters(params))}>Clear all</button></div>
    <div className={styles.filterFields}>
      <div className={styles.filterSection}><label className={styles.fieldLabel} htmlFor={`${prefix}-location`}>Location</label>
        <select id={`${prefix}-location`} value={params.get('suburb') ?? 'perth-cbd'} onChange={(event) => update('suburb', event.target.value)}>
          {origins.map((origin) => <option key={origin.id} value={origin.id}>{origin.name}</option>)}
          {params.has('suburb') && !origins.some((origin) => origin.id === params.get('suburb')) && <option value={params.get('suburb')!}>Selected suburb unavailable</option>}
        </select>
      </div>
      <div className={styles.filterSection}><span className={styles.fieldLabel} id={`${prefix}-when-label`}>When</span>
        <div className={styles.timeMode} role="group" aria-labelledby={`${prefix}-when-label`}>
          <button className={!selectedTime ? styles.selectedMode : ''} type="button" aria-pressed={!selectedTime} onClick={() => update('start', null)}>Open now</button>
          <button className={selectedTime ? styles.selectedMode : ''} type="button" aria-pressed={selectedTime} onClick={() => update('start', formatPerthTime(Date.now()).slice(0, 16))}>Choose a time</button>
        </div><p className={styles.help}>Perth time</p>
        {selectedTime && <div className={styles.timeFields}>
          <label className={styles.smallLabel} htmlFor={`${prefix}-start-date`}>Start date<input type="date" id={`${prefix}-start-date`} min="2000-01-01" max="2100-12-31" required value={startDate} onChange={(event) => update('start', `${event.target.value}T${startTime || '09:00'}`)} /></label>
          <label className={styles.smallLabel} htmlFor={`${prefix}-start-time`}>Start time<input type="time" id={`${prefix}-start-time`} required value={startTime} onChange={(event) => update('start', `${startDate}T${event.target.value}`)} /></label>
        </div>}
        <label className={styles.smallLabel} htmlFor={`${prefix}-end`}>End date and time (optional)<input type="datetime-local" id={`${prefix}-end`} min="2000-01-01T00:00" max="2100-12-31T23:59" value={params.get('end') ?? ''} onChange={(event) => update('end', event.target.value)} /></label>
        {params.has('end') && <button className={styles.textButton} type="button" onClick={() => update('end', null)}>Remove end time</button>}
      </div>
      <div className={styles.filterSection}>
        <label className={styles.switchRow}><input type="checkbox" role="switch" checked={params.get('open24Hours') === 'true'} onChange={(event) => update('open24Hours', event.target.checked ? 'true' : null)} /><span className={styles.switchTrack} aria-hidden="true" /><span><strong>Open 24/7</strong></span></label>
        <label className={styles.switchRow}><input type="checkbox" role="switch" checked={params.get('usableWifi') === 'true'} onChange={(event) => update('usableWifi', event.target.checked ? 'true' : null)} /><span className={styles.switchTrack} aria-hidden="true" /><span><strong>Wi-Fi I can use</strong></span></label>
      </div>
      <fieldset className={styles.filterSection}><legend className={styles.fieldLabel}>Institution</legend><p className={styles.help}>All unless selected</p>
        {INSTITUTIONS.map((institution) => <label className={styles.checkboxRow} key={institution}><input type="checkbox" checked={institutions.includes(institution)} onChange={() => change(toggleFinderSelection(params, 'institutions', institution))} />{INSTITUTION_LABELS[institution]}</label>)}
      </fieldset>
      <fieldset className={styles.filterSection}><legend className={styles.fieldLabel}>Study environment</legend>
        {([['quietStudy', 'Quiet study areas'], ['groupStudy', 'Group study areas'], ['wheelchairAccess', 'Step-free access']] as const).map(([field, label]) => <label className={styles.checkboxRow} key={field}><input type="checkbox" checked={params.get(field) === 'true'} onChange={(event) => update(field, event.target.checked ? 'true' : null)} />{label}</label>)}
      </fieldset>
    </div>
  </>;
}
