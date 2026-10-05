import type { LibrarySearchResult } from '../../domain/library-search';
import type { Institution } from '../../domain/search-context';
import type { MinuteInterval } from '../../domain/schedule';
import type { RequirementMatch } from '../../domain/wifi';
import type { ScheduleTimeline } from '../../domain/availability';
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
export function directionsUrl(result: LibrarySearchResult) {
  const { latitude, longitude, address, name } = result.library.content;
  const destination = latitude !== null && longitude !== null ? `${latitude},${longitude}` : `${name}, ${address}`;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`;
}
