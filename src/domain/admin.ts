import type { LibraryContent, LibraryRecord } from './library';
import type { CalendarSchedule, WeeklyInterval } from './schedule';
import { parseLibraryContent } from './parse-library.ts';

export interface AdminLibrary {
  record: LibraryRecord;
  publishedRevisionId: string | null;
}
export interface AdminList {
  libraries: AdminLibrary[];
  nextSlug: string | null;
}

export function emptyLibraryContent(): LibraryContent {
  return {
    name: '', address: '', suburbId: null, latitude: null, longitude: null, description: '', officialUrl: null,
    photos: [], sources: [], facilities: { quietStudy: 'unknown', groupStudy: 'unknown', wheelchairAccess: 'unknown' },
    wifi: { status: 'unknown', networks: [] },
    schedule: { timeZone: 'Australia/Perth', building: emptyCalendar(), access: [] },
  };
}
export function emptyCalendar(): CalendarSchedule {
  return { status: 'unknown', recurring: [], overrides: [], sourceId: null };
}

/** Reject overlaps, including overnight carry across the Sunday/Monday boundary. */
export function validateAdminIntervals(intervals: WeeklyInterval[]) {
  const week = 7 * 1440;
  const ranges = intervals.map((item) => ({ start: item.weekday * 1440 + item.startMinute, end: item.weekday * 1440 + item.endMinute }));
  for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length; j++) {
    for (const shift of [-week, 0, week]) {
      if (ranges[i].start < ranges[j].end + shift && ranges[j].start + shift < ranges[i].end) {
        throw new Error('Opening intervals overlap. Remove the duplicate or conflicting hours.');
      }
    }
  }
}

/** Adds editor constraints to the existing canonical schedule/data validator. */
export function parseAdminContent(value: unknown): LibraryContent {
  const content = parseLibraryContent(value);
  for (const [label, calendar] of [['Building', content.schedule.building], ...content.schedule.access.map((entry) => [entry.group, entry] as const)] as const) {
    try {
      validateAdminIntervals(calendar.recurring);
      for (const override of calendar.overrides) validateAdminIntervals(override.intervals);
    } catch (error) { throw new Error(`${label} hours: ${error instanceof Error ? error.message : 'Invalid intervals.'}`, { cause: error }); }
  }
  for (const entry of content.schedule.access) {
    if (entry.group === 'unknown' && (entry.status === 'known' || entry.overrides.some((item) => item.status === 'hours'))) {
      throw new Error('Select a confirmed entry group before entering known access hours.');
    }
  }
  for (const network of content.wifi.networks) {
    if (network.kind !== 'unknown' && !network.sourceId) throw new Error('Confirmed Wi-Fi needs a source.');
    if (['institution', 'eduroam'].includes(network.kind) && !network.eligibleCards.length) throw new Error('Select eligible cards for university Wi-Fi.');
    if (network.kind === 'public' && (network.eligibleCards.length || network.needsActiveCredentials)) throw new Error('Public Wi-Fi cannot require university credentials.');
  }
  if (content.photos.some((photo) => !photo.sourceId)) throw new Error('Each photo needs a source and credit.');
  return content;
}

export function validateAdminPublication(content: LibraryContent) {
  if (!content.sources.length || content.sources.some((source) => source.kind === 'fixture' || !source.checkedOn || (source.kind === 'official' && !source.url))) {
    throw new Error('Add dated official sources or library confirmations before publishing.');
  }
}
