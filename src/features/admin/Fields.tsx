import type { ReactNode } from 'react';
import type { SourceRecord } from '../../domain/library';
import styles from './Admin.module.css';

export function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} onInput={['date', 'time', 'datetime-local'].includes(type) ? (event) => onChange(event.currentTarget.value) : undefined} required={required} step={type === 'number' ? 'any' : undefined} /></label>;
}
export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <label>{label}<select value={value} onChange={(event) => { const option = options.find(([key]) => key === event.target.value); if (option) onChange(option[0]); }}>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
}
export function SourceChoice({ sources, value, onChange }: { sources: SourceRecord[]; value: string | null; onChange: (value: string | null) => void }) {
  return <Choice label="Source" value={value ?? ''} options={[["", 'Select a source'], ...sources.map((source) => [source.id, source.label || 'Untitled source'] as const)]} onChange={(next) => onChange(next || null)} />;
}
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className={styles.section}><legend>{title}</legend>{children}</fieldset>;
}
export function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className={styles.secondary} onClick={onClick}>{label}</button>;
}
