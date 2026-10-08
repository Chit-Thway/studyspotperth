import type { EntrySchedule, LibraryRecord } from './library';
import type { SearchRequest } from './search-request';
import type { UniversityCard } from './search-context';
import { calendarTimeline, continuousWindow, intersectIntervals, intervalAt, mergeTimeIntervals } from './availability';
import { formatPerthTime, perthMidnight, shiftDate } from './perth-time';
import { evaluateWifi } from './wifi';
import type { RequirementMatch } from './wifi';

export type OpeningStatus = 'open' | 'closed' | 'unknown';
export type PersonalAccessStatus = 'matches-rules' | 'unmatched' | 'unknown' | 'unavailable';
export interface TwentyFourHourGroup {
  group: 'public' | UniversityCard;
  requirement: string;
  needsActiveCredentials: boolean;
  match: RequirementMatch;
  verifiedFrom: string;
  verifiedUntil: string;
}
export interface TwentyFourHourAccess {
  status: 'qualifies' | 'does-not-qualify' | 'unknown';
  groups: TwentyFourHourGroup[];
}

function entryMatch(entry: EntrySchedule, cards: readonly UniversityCard[]): RequirementMatch {
  return entry.group === 'unknown' ? 'unknown' : entry.group === 'public' ? 'public'
    : cards.includes(entry.group) ? 'matches-profile' : 'not-in-profile';
}

export function approximateDistanceKm(origin: { latitude: number; longitude: number }, location: { latitude: number | null; longitude: number | null }): number | null {
  if (location.latitude === null || location.longitude === null) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(location.latitude - origin.latitude);
  const longitudeDelta = radians(location.longitude - origin.longitude);
  const square = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(origin.latitude)) * Math.cos(radians(location.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, square))));
}

/** Both search cards and details use this explanation; detail remains readable when closed. */
export function evaluateLibrary(library: LibraryRecord, request: SearchRequest) {
  const date = formatPerthTime(request.start).slice(0, 10);
  const building = calendarTimeline(library.content.schedule.building, date);
  const buildingWindow = continuousWindow(building.intervals, request.start, building.end, building.unknown);
  const openingStatus: OpeningStatus = buildingWindow ? 'open' : intervalAt(building.unknown, request.start) ? 'unknown' : 'closed';
  const entries = library.content.schedule.access.map((entry) => {
    const timeline = calendarTimeline(entry, date);
    const intervals = intersectIntervals(building.intervals, timeline.intervals);
    // Availability is uncertain only where neither schedule definitely forbids entry.
    const unknown = mergeTimeIntervals([...intersectIntervals(building.intervals, timeline.unknown),
      ...intersectIntervals(building.unknown, [...timeline.intervals, ...timeline.unknown])]);
    const match = entryMatch(entry, request.cards);
    return { entry, timeline, intervals, unknown, match };
  });
  const matched = entries.filter(({ match }) => match === 'public' || match === 'matches-profile');
  const personalIntervals = mergeTimeIntervals(matched.flatMap(({ intervals }) => intervals));
  const uncertainIntervals = mergeTimeIntervals([...(!entries.length ? building.unknown : []), ...entries.flatMap(({ entry, timeline, unknown, match }) =>
    entry.group === 'unknown' ? [...unknown, ...intersectIntervals(building.intervals, timeline.intervals)] : match === 'public' || match === 'matches-profile' ? unknown : [])]);
  const personalWindow = continuousWindow(personalIntervals, request.start, building.end, uncertainIntervals);
  const nextInterval = personalIntervals.find((interval) => interval.start > request.start);
  // Do not call a later confirmed slot the next opening across an unknown gap.
  const nextWindow = nextInterval && !uncertainIntervals.some((interval) => interval.start < nextInterval.start && interval.end > request.start)
    ? continuousWindow(personalIntervals, nextInterval.start, building.end, uncertainIntervals) : null;
  const personalStatus: PersonalAccessStatus = openingStatus !== 'open' ? openingStatus === 'unknown' ? 'unknown' : 'unavailable'
    : personalWindow ? 'matches-rules'
    : intervalAt(uncertainIntervals, request.start) || !entries.length ? 'unknown'
    : entries.some(({ match, intervals }) => match === 'not-in-profile' && intervalAt(intervals, request.start)) ? 'unmatched' : 'unavailable';
  const weekStart = perthMidnight(date);
  const weekEnd = perthMidnight(shiftDate(date, 7));
  const publicIntervals = mergeTimeIntervals(entries.filter(({ entry }) => entry.group === 'public').flatMap(({ intervals }) => intervals));
  const publicWeek = intervalAt(publicIntervals, weekStart);
  const public24Hours = publicWeek !== undefined && publicWeek.end >= weekEnd;
  const groups: TwentyFourHourGroup[] = entries.flatMap(({ entry, intervals, match }) => {
    if (entry.group === 'unknown') return [];
    // If everyone has continuous public entry, do not invent a card requirement.
    if (public24Hours && entry.group !== 'public') return [];
    // Public hours can bridge restricted hours for the same eligible group.
    const combined = mergeTimeIntervals(entry.group === 'public' ? intervals : [...publicIntervals, ...intervals]);
    const fullWeek = intervalAt(combined, weekStart);
    if (!fullWeek || fullWeek.end < weekEnd) return [];
    return [{ group: entry.group, requirement: entry.requirement, needsActiveCredentials: entry.needsActiveCredentials, match,
      verifiedFrom: formatPerthTime(weekStart), verifiedUntil: formatPerthTime(weekEnd) }];
  });
  const open24Hours: TwentyFourHourAccess = { status: groups.length ? 'qualifies' : !entries.length || entries.some(({ unknown, entry }) =>
    unknown.some((interval) => interval.start < weekEnd && interval.end > weekStart)
    || (entry.group === 'unknown' && openingStatus === 'open')) || building.unknown.some((interval) => interval.start < weekEnd && interval.end > weekStart)
    ? 'unknown' : 'does-not-qualify', groups };
  const priority = library.institution !== 'public' && request.cards.includes(library.institution)
    && groups.some((group) => group.group === 'public' || (group.group === library.institution && group.match === 'matches-profile'));
  const rankingGroup: 'matching-university-24-hours' | 'other' = priority ? 'matching-university-24-hours' : 'other';
  return { library, distanceKm: approximateDistanceKm(request.origin, library.content), opening: { status: openingStatus, window: buildingWindow },
    access: { status: personalStatus, window: personalWindow, nextWindow, explanation: personalStatus === 'matches-rules'
      ? 'Recorded entry rules match public access or your declared cards; this does not verify current eligibility.'
      : personalStatus === 'unmatched' ? 'Required card is not in your profile; opening hours do not grant entry.'
      : personalStatus === 'unknown' ? 'Entry availability is unknown.' : 'No matching entry window at the requested start.',
    requirements: entries.map(({ entry, intervals, unknown, match }) => ({ group: entry.group, requirement: entry.requirement,
      needsActiveCredentials: entry.needsActiveCredentials, match,
      openAtStart: entry.group === 'unknown' || intervalAt(unknown, request.start) ? null : Boolean(intervalAt(intervals, request.start)),
      window: entry.group === 'unknown' ? null : continuousWindow(intervals, request.start, building.end, unknown) })) },
    open24Hours, wifi: evaluateWifi(library.content.wifi, request.cards), rankingGroup,
    exceptions: [{ group: 'building' as const, overrides: building.exceptions }, ...entries.map(({ entry, timeline }) => ({ group: entry.group, overrides: timeline.exceptions }))],
    evaluatedAt: formatPerthTime(request.start), evaluatedUntil: formatPerthTime(building.end) };
}
export type LibrarySearchResult = ReturnType<typeof evaluateLibrary>;

export function searchLibraries(libraries: readonly LibraryRecord[], request: SearchRequest) {
  const results = libraries.filter((library) => library.status === 'published')
    .filter((library) => !request.filters.institutions.length || request.filters.institutions.includes(library.institution))
    .filter((library) => (['quietStudy', 'groupStudy', 'wheelchairAccess'] as const).every((facility) => !request.filters[facility] || library.content.facilities[facility] === 'yes'))
    .map((library) => evaluateLibrary(library, request))
    .filter((result) => result.opening.status !== 'unknown')
    .filter((result) => !request.filters.open24Hours || result.open24Hours.status === 'qualifies')
    .filter((result) => !request.filters.usableWifi || result.wifi.status === 'eligible');
  results.sort((a, b) => {
    const priority = Number(a.rankingGroup !== 'matching-university-24-hours') - Number(b.rankingGroup !== 'matching-university-24-hours');
    if (priority) return priority;
    const distance = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    if (distance !== 0 && !Number.isNaN(distance)) return distance;
    return a.library.slug < b.library.slug ? -1 : a.library.slug > b.library.slug ? 1 : 0;
  });
  return { results: results.slice(request.offset, request.offset + request.limit), total: results.length,
    offset: request.offset, limit: request.limit, nextOffset: request.offset + request.limit < results.length ? request.offset + request.limit : null,
    emptyReason: results.length === 0 ? 'No published libraries have confirmed hours and satisfy your selected filters. Try another time or adjust the filters.'
      : request.offset >= results.length ? 'There are no more results on this page.' : null };
}
