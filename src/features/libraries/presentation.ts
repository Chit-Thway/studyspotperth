import type { LibrarySearchResult } from '../../domain/library-search';
import type { Institution } from '../../domain/search-context';
import type { MinuteInterval } from '../../domain/schedule';
import type { RequirementMatch } from '../../domain/wifi';
import type { ScheduleTimeline } from '../../domain/availability';
import { calendarTimeline, intersectIntervals, mergeTimeIntervals } from '../../domain/availability';
import { formatPerthTime, perthCalendarMinute } from '../../domain/perth-time';

export const INSTITUTION_LABELS: Record<Institution, string> = { public: 'Public libraries', uwa: 'UWA', curtin: 'Curtin', ecu: 'ECU', murdoch: 'Murdoch' };
export const UNIVERSITY_CARDS = ['uwa', 'curtin', 'ecu', 'murdoch'] as const;
export const INSTITUTIONS = ['public', ...UNIVERSITY_CARDS] as const;

export function institutionCategory(institution: Institution) {
  return institution === 'public' ? 'Public library' : `${INSTITUTION_LABELS[institution]} library`;
}
export function readableDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value));
}
export function readableTime(value: string, reference: string) {
  const sameDate = value.slice(0, 10) === reference.slice(0, 10);
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', hour: 'numeric', minute: '2-digit',
    ...(sameDate ? {} : { weekday: 'short', day: 'numeric', month: 'short' }) }).format(new Date(value));
}
export function matchLabel(match: RequirementMatch) {
  return match === 'public' ? 'Public access' : match === 'matches-profile' ? 'Matches your declared cards'
    : match === 'not-in-profile' ? 'Not in your declared cards' : match === 'additional-requirements' ? 'Separate approval required' : 'Unknown';
}
export function availabilityLabel(result: LibrarySearchResult) {
  if (result.opening.status !== 'open') return result.opening.status === 'closed' ? 'Closed at the selected start' : 'Opening hours unknown';
  const personal = result.access.window;
  const window = personal ?? result.opening.window;
  if (!window) return 'Opening hours unknown';
  if (window.endReason === 'verification-limit') return personal ? 'Access in checked period' : 'Open in checked period';
  const end = readableTime(window.until, result.evaluatedAt);
  if (window.endReason === 'unknown') return `${personal ? 'Access confirmed' : 'Opening confirmed'} until ${end}; later hours unknown`;
  return `${personal ? 'Available' : 'Open'} until ${end}`;
}
export function coverageLabel(result: LibrarySearchResult) {
  if (result.coverage.status === 'covered') return 'Covers your session';
  if (result.coverage.status === 'shortfall' && result.coverage.shortfallMinutes !== null) {
    const minutes = result.coverage.shortfallMinutes;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours ? `${hours} hour${hours === 1 ? '' : 's'}` : ''}${hours && remainder ? ' ' : ''}${remainder ? `${remainder} min` : ''} short`;
  }
  return result.coverage.status === 'not-requested' ? null : 'Session coverage unknown';
}
export function minuteTime(minute: number) {
  const wrapped = minute % 1440;
  return `${Math.floor(wrapped / 60).toString().padStart(2, '0')}:${(wrapped % 60).toString().padStart(2, '0')}`;
}
export function intervalLabel(interval: MinuteInterval) {
  return interval.startMinute === 0 && interval.endMinute === 1440 ? '24 hours'
    : `${minuteTime(interval.startMinute)}–${minuteTime(interval.endMinute)}${interval.endMinute > 1440 ? ' next day' : interval.endMinute === 1440 ? ' midnight' : ''}`;
}
export function dayHoursLabel(timeline: Pick<ScheduleTimeline, 'intervals' | 'unknown'>, midnight: number) {
  if (!timeline.intervals.length) return timeline.unknown.length ? 'Unknown' : 'Closed';
  const date = formatPerthTime(midnight).slice(0, 10);
  const hours = timeline.intervals.map((interval) => intervalLabel({
    startMinute: perthCalendarMinute(interval.start, date), endMinute: perthCalendarMinute(interval.end, date),
  })).join(', ');
  return timeline.unknown.length ? `${hours} · remaining hours unknown` : hours;
}
function cardTime(minute: number) {
  if (minute === 0 || minute === 1440) return 'midnight';
  const hour = Math.floor(minute / 60);
  const remainder = minute % 60;
  return `${hour % 12 || 12}${remainder ? `:${remainder.toString().padStart(2, '0')}` : ''} ${hour < 12 ? 'am' : 'pm'}`;
}
function friendlyDayHours(timeline: Pick<ScheduleTimeline, 'intervals' | 'unknown'>, date: string) {
  if (!timeline.intervals.length) return timeline.unknown.length ? 'Unknown' : 'Closed';
  const hours = timeline.intervals.map((interval) => {
    const start = perthCalendarMinute(interval.start, date);
    const end = perthCalendarMinute(interval.end, date);
    return start === 0 && end === 1440 ? '24 hours' : `${cardTime(start)}–${cardTime(end)}`;
  }).join(', ');
  return `${hours}${timeline.unknown.length ? ' · remaining hours unknown' : ''}`;
}
function entryDayTimeline(result: LibrarySearchResult, group: Institution) {
  const date = result.evaluatedAt.slice(0, 10);
  const schedule = result.library.content.schedule.access.find((entry) => entry.group === group);
  if (!schedule) return null;
  const entry = calendarTimeline(schedule, date, 1);
  const building = calendarTimeline(result.library.content.schedule.building, date, 1);
  return {
    intervals: intersectIntervals(building.intervals, entry.intervals),
    unknown: mergeTimeIntervals([...intersectIntervals(building.intervals, entry.unknown),
      ...intersectIntervals(building.unknown, [...entry.intervals, ...entry.unknown])]),
  };
}
export function entryDayHoursLabel(result: LibrarySearchResult, group: Institution | 'unknown') {
  const timeline = group === 'unknown' ? null : entryDayTimeline(result, group);
  return timeline ? friendlyDayHours(timeline, result.evaluatedAt.slice(0, 10)) : 'Unknown';
}
export function cardEntryLabel(result: LibrarySearchResult, group: Institution | 'unknown') {
  if (group === 'unknown') return undefined;
  if (group === 'public') {
    const entry = result.access.requirements.find((item) => item.group === group);
    return entry && entryDayTimeline(result, group)?.intervals.length ? 'Public access' : undefined;
  }
  if (result.open24Hours.groups.some((entry) => entry.group === group)) return `24/7 · ${INSTITUTION_LABELS[group]} card`;
  const timeline = entryDayTimeline(result, group);
  const first = timeline?.intervals[0];
  if (!first) return undefined;
  const time = cardTime(perthCalendarMinute(first.start, result.evaluatedAt.slice(0, 10)));
  return `${time} access · ${INSTITUTION_LABELS[group]} card`;
}
export function openingDayLabel(result: LibrarySearchResult, now = Date.now()) {
  const date = result.evaluatedAt.slice(0, 10);
  const day = date === formatPerthTime(now).slice(0, 10) ? 'today' : readableDate(date);
  const timeline = calendarTimeline(result.library.content.schedule.building, date, 1);
  if (!timeline.intervals.length) return timeline.unknown.length ? `Hours unknown · ${day}` : `Closed ${day}`;
  return `Open ${day} ${friendlyDayHours(timeline, date)}`;
}
export function directionsUrl(result: LibrarySearchResult) {
  const { latitude, longitude, address, name } = result.library.content;
  const destination = latitude !== null && longitude !== null ? `${latitude},${longitude}` : `${name}, ${address}`;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`;
}
export function mapsLocationUrl(result: LibrarySearchResult) {
  const { name, address } = result.library.content;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${name}, ${address}` })}`;
}
