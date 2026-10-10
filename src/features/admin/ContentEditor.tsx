import type { LibraryContent, SourceRecord } from '../../domain/library';
import type { SearchOrigin } from '../../domain/search-request';
import { emptyCalendar } from '../../domain/admin';
import { Field, Choice, Check, Remove, Section, SourceChoice } from './Fields';
import { ScheduleEditor } from './ScheduleEditor';
import styles from './Admin.module.css';

import { INSTITUTION_LABELS, UNIVERSITY_CARDS } from '../libraries/presentation';
const CARDS = UNIVERSITY_CARDS.map((card) => [card, INSTITUTION_LABELS[card]] as const);
export function ContentEditor({ content, onChange, origins }: { content: LibraryContent; onChange: (value: LibraryContent) => void; origins: SearchOrigin[] }) {
  const update = (change: Partial<LibraryContent>) => onChange({ ...content, ...change });
  const source = (index: number, change: Partial<SourceRecord>) => update({ sources: content.sources.map((item, at) => at === index ? { ...item, ...change } : item) });
  return <>
    <Section title="Library details"><div className={styles.row}>
      <Field label="Library name" value={content.name} onChange={(name) => update({ name })} required />
      <Field label="Address" value={content.address} onChange={(address) => update({ address })} required />
      <Choice label="Suburb" value={content.suburbId ?? ''} options={[["", 'Unknown'], ...origins.filter((item) => item.id !== 'perth-cbd').map((item) => [item.id, item.name] as const)]} onChange={(suburbId) => update({ suburbId: suburbId || null })} />
      <Field label="Latitude" type="number" value={content.latitude === null ? '' : String(content.latitude)} onChange={(latitude) => update({ latitude: latitude === '' ? null : Number(latitude) })} />
      <Field label="Longitude" type="number" value={content.longitude === null ? '' : String(content.longitude)} onChange={(longitude) => update({ longitude: longitude === '' ? null : Number(longitude) })} />
      <Field label="Official website" type="url" value={content.officialUrl ?? ''} onChange={(officialUrl) => update({ officialUrl: officialUrl || null })} />
    </div><label>Description<textarea value={content.description} onChange={(event) => update({ description: event.target.value })} rows={3} /></label></Section>
    <Section title="Sources"><p className={styles.note}>Published facts need a source and checked date. Photo sources must cover usage permission.</p>
      {content.sources.map((item, index) => <Section title={`Source ${index + 1}`} key={item.id}><div className={styles.row}>
        <Field label="Source label" value={item.label} onChange={(label) => source(index, { label })} required />
        <Choice label="Source type" value={item.kind} options={[["official", 'Official information'], ["confirmation", 'Library confirmation']]} onChange={(kind) => source(index, { kind })} />
        <Field label="Source URL" type="url" value={item.url ?? ''} onChange={(url) => source(index, { url: url || null })} />
        <Field label="Checked on" type="date" value={item.checkedOn ?? ''} onChange={(checkedOn) => source(index, { checkedOn: checkedOn || null })} />
      </div><Remove label={`Remove source ${index + 1}`} onClick={() => update({ sources: content.sources.filter((_, at) => at !== index) })} /></Section>)}
      <button type="button" className={styles.secondary} onClick={() => update({ sources: [...content.sources, { id: crypto.randomUUID(), kind: 'official', label: '', url: null, checkedOn: null }] })}>Add source</button>
    </Section>
    <Section title="Photos">
      {content.photos.map((item, index) => <Section title={`Photo ${index + 1}`} key={index}><div className={styles.row}>
        {(['url', 'alt', 'credit'] as const).map((key) => <Field key={key} label={key === 'url' ? 'Photo URL or image path' : key === 'alt' ? 'Image description' : 'Photo credit'} value={item[key]} onChange={(value) => update({ photos: content.photos.map((photo, at) => at === index ? { ...photo, [key]: value } : photo) })} required />)}
        <SourceChoice sources={content.sources} value={item.sourceId} onChange={(sourceId) => update({ photos: content.photos.map((photo, at) => at === index ? { ...photo, sourceId } : photo) })} />
      </div><Remove label={`Remove photo ${index + 1}`} onClick={() => update({ photos: content.photos.filter((_, at) => at !== index) })} /></Section>)}
      <button type="button" className={styles.secondary} onClick={() => update({ photos: [...content.photos, { url: '', alt: '', credit: '', sourceId: null }] })}>Add photo</button>
    </Section>
    <Section title="Facilities"><div className={styles.row}>{([['quietStudy', 'Quiet areas'], ['groupStudy', 'Group spaces'], ['wheelchairAccess', 'Step-free access']] as const).map(([key, label]) => <Choice key={key} label={label} value={content.facilities[key]} options={[["unknown", 'Unknown'], ["yes", 'Available'], ["no", 'Not available']]} onChange={(value) => update({ facilities: { ...content.facilities, [key]: value } })} />)}</div></Section>
    <ScheduleEditor title="Building hours" value={content.schedule.building} sources={content.sources} onChange={(building) => update({ schedule: { ...content.schedule, building } })} />
    <Section title="Entry schedules">
      {content.schedule.access.map((entry, index) => {
        const setEntry = (change: Partial<typeof entry>) => update({ schedule: { ...content.schedule, access: content.schedule.access.map((item, at) => at === index ? { ...item, ...change } : item) } });
        return <Section title={`Entry ${index + 1}`} key={index}><div className={styles.row}>
          <Choice label="Entry group" value={entry.group} options={[["public", 'Public'], ...CARDS, ["unknown", 'Unknown']]} onChange={(group) => setEntry({ group })} />
          <Field label="Entry requirement" value={entry.requirement} onChange={(requirement) => setEntry({ requirement })} required />
          <Check label="Active credentials required" checked={entry.needsActiveCredentials} onChange={(needsActiveCredentials) => setEntry({ needsActiveCredentials })} />
        </div><ScheduleEditor title="Entry hours" value={entry} sources={content.sources} onChange={(calendar) => setEntry(calendar)} />
          <Remove label={`Remove entry ${index + 1}`} onClick={() => update({ schedule: { ...content.schedule, access: content.schedule.access.filter((_, at) => at !== index) } })} />
        </Section>;
      })}
      <button type="button" className={styles.secondary} onClick={() => update({ schedule: { ...content.schedule, access: [...content.schedule.access, { ...emptyCalendar(), group: 'public', requirement: 'Public access', needsActiveCredentials: false }] } })}>Add entry group</button>
    </Section>
    <Section title="Wi-Fi"><Choice label="Wi-Fi information" value={content.wifi.status} options={[["unknown", 'Unknown'], ["known", 'Known']]} onChange={(status) => update({ wifi: { status, networks: status === 'unknown' ? [] : content.wifi.networks } })} />
      {content.wifi.networks.map((item, index) => {
        const setNetwork = (change: Partial<typeof item>) => update({ wifi: { ...content.wifi, networks: content.wifi.networks.map((network, at) => at === index ? { ...network, ...change } : network) } });
        return <Section title={`Network ${index + 1}`} key={index}><div className={styles.row}>
          <Field label="Network name" value={item.name} onChange={(name) => setNetwork({ name })} required />
          <Choice label="Network type" value={item.kind} options={[["public", 'Public'], ["institution", 'University'], ["eduroam", 'eduroam'], ["restricted-guest", 'Restricted guest'], ["unknown", 'Unknown']]} onChange={(kind) => setNetwork({ kind })} />
          <Field label="Connection requirements" value={item.requirements} onChange={(requirements) => setNetwork({ requirements })} required />
          <Field label="Limits" value={item.limits ?? ''} onChange={(limits) => setNetwork({ limits: limits || null })} />
          <Field label="Connection help URL" type="url" value={item.helpUrl ?? ''} onChange={(helpUrl) => setNetwork({ helpUrl: helpUrl || null })} />
          <SourceChoice sources={content.sources} value={item.sourceId} onChange={(sourceId) => setNetwork({ sourceId })} />
          <Check label="Active login required" checked={item.needsActiveCredentials} onChange={(needsActiveCredentials) => setNetwork({ needsActiveCredentials })} />
        </div><div className={styles.row}>{CARDS.map(([card, label]) => <Check key={card} label={`${label} Wi-Fi eligible`} checked={item.eligibleCards.includes(card)} onChange={(checked) => setNetwork({ eligibleCards: checked ? [...item.eligibleCards, card] : item.eligibleCards.filter((value) => value !== card) })} />)}</div>
          <Remove label={`Remove network ${index + 1}`} onClick={() => update({ wifi: { ...content.wifi, networks: content.wifi.networks.filter((_, at) => at !== index) } })} />
        </Section>;
      })}
      {content.wifi.status === 'known' && <button type="button" className={styles.secondary} onClick={() => update({ wifi: { ...content.wifi, networks: [...content.wifi.networks, { name: '', kind: 'public', eligibleCards: [], needsActiveCredentials: false, requirements: 'No university login required', limits: null, helpUrl: null, sourceId: null }] } })}>Add network</button>}
    </Section>
  </>;
}
