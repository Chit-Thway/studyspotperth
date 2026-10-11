import type { LibrarySearchResult } from '../../domain/library-search';
import type { Institution } from '../../domain/search-context';
import { UNIVERSITY_CARDS } from '../../domain/search-context';
import type { CalendarSchedule, MinuteInterval } from '../../domain/schedule';
import type { RequirementMatch } from '../../domain/wifi';
import type { ScheduleTimeline } from '../../domain/availability';
import { calendarTimeline, intersectIntervals, mergeTimeIntervals } from '../../domain/availability';
import { DAY_MS, formatPerthTime, perthCalendarMinute, shiftDate } from '../../domain/perth-time';

export { UNIVERSITY_CARDS };
export const INSTITUTION_LABELS: Record<Institution, string> = { public: 'Public libraries', uwa: 'UWA', curtin: 'Curtin', ecu: 'ECU', murdoch: 'Murdoch', 'notre-dame': 'Notre Dame' };
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
/** The current Perth week, independent of the visitor's search date. */
export function weeklyOpeningHours(schedule: CalendarSchedule, building: CalendarSchedule = schedule, now = Date.now()) {
  const today = formatPerthTime(now).slice(0, 10);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = shiftDate(today, -((weekday + 6) % 7));
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => {
    const date = shiftDate(monday, index);
    const entry = calendarTimeline(schedule, date, 1);
    const open = calendarTimeline(building, date, 1);
    const intervals = intersectIntervals(entry.intervals, open.intervals);
    const unknown = mergeTimeIntervals([...intersectIntervals(open.intervals, entry.unknown),
      ...intersectIntervals(open.unknown, [...entry.intervals, ...entry.unknown])]);
    const hours = intervals.map((interval) => {
      const start = perthCalendarMinute(interval.start, date);
      const end = perthCalendarMinute(interval.end, date);
      return `${cardTime(start)}–${cardTime(end)}${end === 1440 ? ' (next day)' : ''}`;
    }).join(', ');
    return { day, hours: hours ? `${hours}${unknown.length ? ' · remaining hours unknown' : ''}` : unknown.length ? 'Unknown' : 'Closed' };
  });
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
    return start === 0 && end === 1440 ? '24 hours' : `${cardTime(start)}–${cardTime(end % 1440)}${end > 1440 ? ' (next day)' : ''}`;
  }).join(', ');
  return `${hours}${timeline.unknown.length ? ' · remaining hours unknown' : ''}`;
}
function entryDayTimeline(result: LibrarySearchResult, group: Institution, date = result.evaluatedAt.slice(0, 10)) {
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
function displayedOpeningDate(result: LibrarySearchResult) {
  return result.access.window ? result.evaluatedAt.slice(0, 10) : result.access.nextWindow?.from.slice(0, 10) ?? result.evaluatedAt.slice(0, 10);
}
export function entryDayHoursLabel(result: LibrarySearchResult, group: Institution | 'unknown') {
  const date = displayedOpeningDate(result);
  const timeline = group === 'unknown' ? null : entryDayTimeline(result, group, date);
  return timeline ? friendlyDayHours(timeline, date) : 'Unknown';
}
export function cardEntryLabel(result: LibrarySearchResult, group: Institution | 'unknown') {
  const date = displayedOpeningDate(result);
  if (group === 'unknown') return undefined;
  if (group === 'public') {
    const entry = result.access.requirements.find((item) => item.group === group);
    return entry && entryDayTimeline(result, group, date)?.intervals.length ? 'Public access' : undefined;
  }
  if (result.open24Hours.groups.some((entry) => entry.group === group)) return `24/7 · ${INSTITUTION_LABELS[group]} card`;
  const timeline = entryDayTimeline(result, group, date);
  const first = timeline?.intervals[0];
  if (!first) return undefined;
  const time = cardTime(perthCalendarMinute(first.start, date));
  return `${time} access · ${INSTITUTION_LABELS[group]} card`;
}
export function openingDayLabel(result: LibrarySearchResult, showBuildingHours = false) {
  if (showBuildingHours && result.opening.status === 'open') {
    const date = result.evaluatedAt.slice(0, 10);
    const timeline = calendarTimeline(result.library.content.schedule.building, date, 1);
    const day = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', weekday: 'short' }).format(new Date(`${date}T12:00:00+08:00`));
    return `Open ${friendlyDayHours(timeline, date)} ${day}`;
  }
  if (result.access.status === 'unknown') return 'Entry hours unknown';
  const window = result.access.window ?? result.access.nextWindow;
  if (!window) return result.access.requirements.length && result.access.requirements.every((entry) => entry.match === 'not-in-profile')
    ? 'Card access only' : 'Next opening unknown';
  const date = displayedOpeningDate(result);
  const timelines = result.access.requirements.filter((entry) => entry.match === 'public' || entry.match === 'matches-profile')
    .flatMap((entry) => entry.group === 'unknown' ? [] : [entryDayTimeline(result, entry.group, date)!]);
  const intervals = mergeTimeIntervals(timelines.flatMap((timeline) => timeline.intervals));
  const unknown = mergeTimeIntervals(timelines.flatMap((timeline) => timeline.unknown))
    .filter((gap) => !intervals.some((interval) => interval.start <= gap.start && interval.end >= gap.end));
  const from = Date.parse(window.from);
  const until = Date.parse(window.until);
  const overnight = window.from.slice(0, 10) !== window.until.slice(0, 10) && window.until.slice(11, 16) !== '00:00' && until - from < DAY_MS;
  const visibleIntervals = overnight ? [{ start: from, end: until }]
    : result.access.window ? intervals : intervals.filter((interval) => interval.end > from);
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', weekday: 'short' }).format(new Date(`${date}T12:00:00+08:00`));
  return `${result.access.window ? '' : 'Closed · '}Open ${friendlyDayHours({ intervals: visibleIntervals, unknown }, date)} ${day}`;
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
