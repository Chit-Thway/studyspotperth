import { assertLocalDate, PERTH_TIME_ZONE } from './schedule';

export const MINUTE_MS = 60_000;
export const DAY_MS = 1440 * MINUTE_MS;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PERTH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

function partsAt(timestamp: number) {
  const parts = formatter.formatToParts(timestamp);
  return (kind: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === kind)!.value;
}

function offsetAt(timestamp: number): number {
  const offset = partsAt(timestamp)('timeZoneName').replace('GMT', '');
  if (!offset) return 0;
  const [, sign, hours, minutes] = /^([+-])(\d{2}):(\d{2})$/.exec(offset)!;
  return (Number(hours) * 60 + Number(minutes)) * MINUTE_MS * (sign === '-' ? -1 : 1);
}

/** Find both possible offsets around a transition using the installed IANA data.
 * Form inputs reject skipped minutes and choose the earlier repeated minute.
 * Schedule starts use the earlier occurrence, ends the later occurrence; skipped
 * schedule boundaries move forward by the clock jump (compatible disambiguation).
 */
function localTimestamp(value: string, boundary: 'input' | 'start' | 'end'): number {
  const wall = Date.parse(`${value}:00Z`);
  const offsets = new Set([-DAY_MS, 0, DAY_MS].map((delta) => offsetAt(wall + delta)));
  const candidates = [...offsets].map((offset) => wall - offset).sort((a, b) => a - b);
  const matches = candidates.filter((timestamp) => formatPerthTime(timestamp).slice(0, 16) === value);
  if (matches.length) return boundary === 'end' ? matches.at(-1)! : matches[0];
  if (boundary !== 'input') {
    const shifted = candidates.find((timestamp) => formatPerthTime(timestamp).slice(0, 16) > value);
    if (shifted !== undefined) return shifted;
  }
  throw new Error('This Perth time does not exist because the clocks moved forward.');
}

/** A local form time, deliberately separate from UTC timestamps. */
export function parsePerthTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Use a Perth time in YYYY-MM-DDTHH:mm format.');
  assertLocalDate(value.slice(0, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  if (hour > 23 || minute > 59 || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) {
    throw new Error('Use a valid Perth date from 2000–2100 and time from 00:00–23:59.');
  }
  return localTimestamp(value, 'input');
}

export function formatPerthTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new Error('Invalid clock timestamp.');
  const part = partsAt(timestamp);
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}${offset}`;
}

export function shiftDate(date: string, days: number): string {
  assertLocalDate(date);
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function perthMidnight(date: string): number {
  assertLocalDate(date);
  return localTimestamp(`${date}T00:00`, 'start');
}

/** Calendar minutes, including midnight at minute 1440, rather than elapsed time. */
export function perthScheduleTime(date: string, minute: number, boundary: 'start' | 'end'): number {
  const localDate = shiftDate(date, Math.floor(minute / 1440));
  const remainder = minute % 1440;
  const time = `${Math.floor(remainder / 60).toString().padStart(2, '0')}:${(remainder % 60).toString().padStart(2, '0')}`;
  return localTimestamp(`${localDate}T${time}`, boundary);
}

export function perthCalendarMinute(timestamp: number, date: string): number {
  const local = formatPerthTime(timestamp);
  const days = (Date.parse(`${local.slice(0, 10)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS;
  return days * 1440 + Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}
