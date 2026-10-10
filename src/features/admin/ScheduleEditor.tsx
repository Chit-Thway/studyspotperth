import { useState } from 'react';
import type { CalendarSchedule, ScheduleOverride, WeeklyInterval } from '../../domain/schedule';
import type { SourceRecord } from '../../domain/library';
import { Field, Choice, Check, Remove, Section, SourceChoice } from './Fields';
import styles from './Admin.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const time = (minute: number) => `${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const minutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
export function IntervalEditor({ value, onChange, date }: { value: WeeklyInterval[]; onChange: (value: WeeklyInterval[]) => void; date?: string }) {
  const [copyDay, setCopyDay] = useState(1);
  const [targets, setTargets] = useState<number[]>([2, 3, 4, 5]);
  function update(index: number, change: Partial<WeeklyInterval>) { onChange(value.map((item, at) => at === index ? { ...item, ...change } : item)); }
  const dateDay = date && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ? new Date(`${date}T00:00:00Z`).getUTCDay() : null;
  return <div className={styles.intervals}>
    {value.map((item, index) => <div className={styles.interval} key={index}>
      {dateDay === null && <Choice label="Day" value={String(item.weekday)} options={DAYS.map((label, day) => [String(day), label] as const)} onChange={(day) => update(index, { weekday: Number(day) })} />}
      <Field label="Opens" type="time" value={time(item.startMinute)} onChange={(value) => update(index, { startMinute: minutes(value) })} />
      <Field label="Closes" type="time" value={time(item.endMinute)} onChange={(value) => update(index, { endMinute: minutes(value) + (item.endMinute >= 1440 ? 1440 : 0) })} />
      <Check label="Next day" checked={item.endMinute >= 1440} onChange={(next) => update(index, { endMinute: item.endMinute % 1440 + (next ? 1440 : 0) })} />
      <button type="button" className={styles.secondary} onClick={() => update(index, { startMinute: 0, endMinute: 1440 })}>Full day</button>
      <Remove label={`Remove interval ${index + 1}`} onClick={() => onChange(value.filter((_, at) => at !== index))} />
    </div>)}
    <button type="button" className={styles.secondary} onClick={() => onChange([...value, { weekday: dateDay ?? 1, startMinute: 540, endMinute: 1020 }])}>Add hours</button>
    {dateDay === null && <details className={styles.copy}><summary>Copy hours across days</summary>
      <Choice label="Copy from" value={String(copyDay)} options={DAYS.map((label, day) => [String(day), label] as const)} onChange={(day) => setCopyDay(Number(day))} />
      <div className={styles.row}>{DAYS.map((label, day) => <Check key={label} label={label} checked={targets.includes(day)} onChange={(checked) => setTargets(checked ? [...targets, day] : targets.filter((item) => item !== day))} />)}</div>
      <button type="button" className={styles.secondary} onClick={() => {
        const from = value.filter((item) => item.weekday === copyDay);
        onChange([...value.filter((item) => !targets.includes(item.weekday)), ...targets.flatMap((weekday) => from.map((item) => ({ ...item, weekday })))]);
      }}>Copy to selected days</button>
    </details>}
  </div>;
}

export function ScheduleEditor({ title, value, sources, onChange }: { title: string; value: CalendarSchedule; sources: SourceRecord[]; onChange: (value: CalendarSchedule) => void }) {
  const setOverride = (index: number, change: Partial<ScheduleOverride>) => onChange({ ...value, overrides: value.overrides.map((item, at) => at === index ? { ...item, ...change } : item) });
  return <Section title={title}>
    <div className={styles.row}><Choice label="Recurring hours" value={value.status} options={[["unknown", 'Unknown'], ["known", 'Known']]} onChange={(status) => onChange({ ...value, status, recurring: status === 'unknown' ? [] : value.recurring })} />
      <SourceChoice sources={sources} value={value.sourceId} onChange={(sourceId) => onChange({ ...value, sourceId })} /></div>
    {value.status === 'known' && <><p className={styles.note}>Days without hours are closed unless marked unconfirmed. Use Full day for midnight to midnight.</p>
      <div className={styles.row}>{DAYS.map((label, day) => <Check key={label} label={`${label} hours unconfirmed`} checked={value.unknownWeekdays?.includes(day) ?? false} onChange={(checked) => {
        const unknownWeekdays = checked ? [...(value.unknownWeekdays ?? []), day] : (value.unknownWeekdays ?? []).filter((item) => item !== day);
        onChange({ ...value, unknownWeekdays, recurring: checked ? value.recurring.filter((item) => item.weekday !== day) : value.recurring });
      }} />)}</div>
      <IntervalEditor value={value.recurring} onChange={(recurring) => onChange({ ...value, recurring,
        unknownWeekdays: (value.unknownWeekdays ?? []).filter((day) => !recurring.some((interval) => interval.weekday === day)) })} /></>}
    <h3>Closures and overrides</h3>
    {value.overrides.map((item, index) => <Section title={`Exception ${index + 1}`} key={item.id}>
      <div className={styles.row}>
        <Choice label="Applies to" value={item.kind} options={[["date", 'Exact date'], ["period", 'Date range']]} onChange={(kind) => setOverride(index, { kind, endDate: kind === 'date' ? item.startDate : item.endDate, intervals: [] })} />
        <Field label="From date" type="date" value={item.startDate} onChange={(startDate) => setOverride(index, { startDate, endDate: item.kind === 'date' ? startDate : item.endDate, intervals: item.kind === 'date' ? item.intervals.map((interval) => ({ ...interval, weekday: new Date(`${startDate}T00:00:00Z`).getUTCDay() })) : item.intervals })} />
        {item.kind === 'period' && <Field label="Through date" type="date" value={item.endDate} onChange={(endDate) => setOverride(index, { endDate })} />}
        <Choice label="Change" value={item.status} options={[["closed", 'Closed'], ["hours", 'Replacement hours'], ["unknown", 'Unknown']]} onChange={(status) => setOverride(index, { status, intervals: [] })} />
        <SourceChoice sources={sources} value={item.sourceId} onChange={(sourceId) => setOverride(index, { sourceId })} />
      </div>
      {item.status === 'hours' && <IntervalEditor value={item.intervals} date={item.kind === 'date' ? item.startDate : undefined} onChange={(intervals) => setOverride(index, { intervals })} />}
      <Remove label={`Remove exception ${index + 1}`} onClick={() => onChange({ ...value, overrides: value.overrides.filter((_, at) => at !== index) })} />
    </Section>)}
    <button type="button" className={styles.secondary} onClick={() => onChange({ ...value, overrides: [...value.overrides, { id: crypto.randomUUID(), kind: 'date', startDate: '', endDate: '', status: 'closed', intervals: [], sourceId: value.sourceId }] })}>Add closure or override</button>
  </Section>;
}
