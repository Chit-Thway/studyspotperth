import { assertLocalDate, localDateParts, PERTH_TIME_ZONE } from './schedule';

export const MINUTE_MS = 60_000;
export const DAY_MS = 1440 * MINUTE_MS;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PERTH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

interface Offset { milliseconds: number; label: string }
// Bounded, deterministic timezone data only: no schedules, user data or I/O.
const instantOffsets = new Map<number, Offset>();
const dayOffsets = new Map<number, readonly Offset[]>();
function cacheValue<T>(cache: Map<number, T>, key: number, value: T, limit: number): T {
  if (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

function offsetAt(timestamp: number): Offset {
  const cached = instantOffsets.get(timestamp);
  if (cached) return cached;
  const label = formatter.formatToParts(timestamp).find((part) => part.type === 'timeZoneName')!.value.replace('GMT', '') || '+00:00';
  const [, sign, hours, minutes, seconds] = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(label)!;
  const milliseconds = ((Number(hours) * 60 + Number(minutes)) * MINUTE_MS + Number(seconds ?? 0) * 1000) * (sign === '-' ? -1 : 1);
  return cacheValue(instantOffsets, timestamp, { milliseconds, label }, 512);
}

function offsetsForDay(timestamp: number): readonly Offset[] {
  const day = Math.floor(timestamp / DAY_MS);
  const cached = dayOffsets.get(day);
  if (cached) return cached;
  const offsets = new Map<number, Offset>();
  // These UTC midnights bracket the Perth local day (+08/+09 in the supported
  // range). Adjacent dates reuse the same probes, including DST transitions.
  for (const delta of [-1, 0, 1]) {
    const offset = offsetAt((day + delta) * DAY_MS);
    offsets.set(offset.milliseconds, offset);
  }
  return cacheValue(dayOffsets, day, [...offsets.values()], 128);
}

/** Find both possible offsets around a transition using the installed IANA data.
 * Form inputs reject skipped minutes and choose the earlier repeated minute.
 * Schedule starts use the earlier occurrence, ends the later occurrence; skipped
 * schedule boundaries move forward by the clock jump (compatible disambiguation).
 */
function localTimestamp(wall: number, boundary: 'input' | 'start' | 'end'): number {
  const offsets = offsetsForDay(wall);
  if (offsets.length === 1) return wall - offsets[0].milliseconds;
  const value = new Date(wall).toISOString().slice(0, 16);
  const candidates = offsets.map((offset) => wall - offset.milliseconds).sort((a, b) => a - b);
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
  return localTimestamp(Date.parse(`${value}:00Z`), 'input');
}

export function formatPerthTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new Error('Invalid clock timestamp.');
  const offsets = offsetsForDay(timestamp);
  const offset = offsets.length === 1 ? offsets[0] : offsetAt(timestamp);
  return `${new Date(timestamp + offset.milliseconds).toISOString().slice(0, 19)}${offset.label}`;
}

export function shiftDate(date: string, days: number): string {
  return new Date(localDateParts(date).timestamp + days * DAY_MS).toISOString().slice(0, 10);
}

export function perthMidnight(date: string): number {
  return localTimestamp(localDateParts(date).timestamp, 'start');
}

/** Calendar minutes, including midnight at minute 1440, rather than elapsed time. */
export function perthScheduleTime(date: string, minute: number, boundary: 'start' | 'end'): number {
  if (!Number.isInteger(minute) || minute < 0 || minute > 2880) throw new Error('Use valid calendar minutes.');
  return localTimestamp(localDateParts(date).timestamp + minute * MINUTE_MS, boundary);
}

export function perthCalendarMinute(timestamp: number, date: string): number {
  const local = formatPerthTime(timestamp);
  const days = (localDateParts(local.slice(0, 10)).timestamp - localDateParts(date).timestamp) / DAY_MS;
  return days * 1440 + Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}
