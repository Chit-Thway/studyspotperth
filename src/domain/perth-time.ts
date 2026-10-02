import { assertLocalDate, PERTH_TIME_ZONE } from './schedule';

export const MINUTE_MS = 60_000;
export const DAY_MS = 1440 * MINUTE_MS;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PERTH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** A local form time, deliberately separate from UTC timestamps. */
export function parsePerthTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Use a Perth time in YYYY-MM-DDTHH:mm format.');
  assertLocalDate(value.slice(0, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  if (hour > 23 || minute > 59 || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) {
    throw new Error('Use a valid Perth date from 2000–2100 and time from 00:00–23:59.');
  }
  // Perth has no daylight saving in this supported date range. Round-trip below
  // also checks the explicit timezone rather than the computer's timezone.
  const timestamp = Date.parse(`${value}:00+08:00`);
  if (formatPerthTime(timestamp).slice(0, 16) !== value) throw new Error('Invalid Perth time.');
  return timestamp;
}

export function formatPerthTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new Error('Invalid clock timestamp.');
  const parts = formatter.formatToParts(timestamp);
  const part = (kind: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === kind)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}+08:00`;
}

export function shiftDate(date: string, days: number): string {
  assertLocalDate(date);
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function perthMidnight(date: string): number {
  assertLocalDate(date);
  return Date.parse(`${date}T00:00:00+08:00`);
}
