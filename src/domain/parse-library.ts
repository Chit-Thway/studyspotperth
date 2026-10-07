import type { CalendarSchedule, ScheduleOverride, WeeklyInterval } from './schedule.ts';
import { assertLocalDate, PERTH_TIME_ZONE, validateCalendar } from './schedule.ts';
import type { LibraryContent, SourceRecord } from './library.ts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 10_000) throw new Error('Invalid text field.');
  return value;
}
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Expected a bounded array.');
  return value as unknown[];
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const matched = choices.find((candidate) => candidate === value);
  if (!matched) throw new Error('Invalid option.');
  return matched;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Expected a boolean.');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected a finite number.');
  return value;
}
function url(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value);
  if (new URL(result).protocol !== 'https:') throw new Error('Links must use HTTPS.');
  return result;
}
function photoUrl(value: unknown): string {
  const result = text(value);
  if (/^\/images\/libraries\/[a-z0-9-]+\.webp$/.test(result)) return result;
  return url(result)!;
}
function date(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value);
  assertLocalDate(result);
  return result;
}
const cards = ['uwa', 'curtin', 'ecu', 'murdoch'] as const;
const factStatuses = ['yes', 'no', 'unknown'] as const;

function weeklyInterval(value: unknown): WeeklyInterval {
  const item = object(value);
  return { weekday: number(item.weekday), startMinute: number(item.startMinute), endMinute: number(item.endMinute) };
}

function calendar(value: unknown, sourceIds: Set<string>): CalendarSchedule {
  const item = object(value);
  const source = (input: unknown) => {
    const id = nullableText(input);
    if (id !== null && !sourceIds.has(id)) throw new Error('Unknown source reference.');
    return id;
  };
  const result: CalendarSchedule = {
    status: choice(item.status, ['known', 'unknown']), sourceId: source(item.sourceId),
    recurring: list(item.recurring).map(weeklyInterval),
    overrides: list(item.overrides).map((input): ScheduleOverride => {
      const override = object(input);
      return {
        id: text(override.id), kind: choice(override.kind, ['date', 'period']),
        startDate: text(override.startDate), endDate: text(override.endDate),
        status: choice(override.status, ['hours', 'closed', 'unknown']),
        intervals: list(override.intervals).map(weeklyInterval), sourceId: source(override.sourceId),
      };
    }),
  };
  validateCalendar(result);
  if (result.status === 'known' && result.sourceId === null) throw new Error('Known hours require a source reference.');
  if (result.overrides.some((override) => override.status !== 'unknown' && override.sourceId === null)) {
    throw new Error('Confirmed override hours or closures require a source reference.');
  }
  return result;
}

/** Builds a canonical document; unrecognised fields never reach public records. */
export function parseLibraryContent(value: unknown): LibraryContent {
  const item = object(value);
  const sources = list(item.sources).map((input): SourceRecord => {
    const source = object(input);
    return { id: text(source.id), kind: choice(source.kind, ['official', 'confirmation', 'fixture']),
      label: text(source.label), url: url(source.url), checkedOn: date(source.checkedOn) };
  });
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length) throw new Error('Duplicate source ID.');
  const source = (input: unknown) => {
    const id = nullableText(input);
    if (id !== null && !sourceIds.has(id)) throw new Error('Unknown source reference.');
    return id;
  };
  const facilities = object(item.facilities);
  const wifi = object(item.wifi);
  const schedule = object(item.schedule);
  const latitude = item.latitude === null ? null : number(item.latitude);
  const longitude = item.longitude === null ? null : number(item.longitude);
  if ((latitude === null) !== (longitude === null)
    || (latitude !== null && Math.abs(latitude) > 90) || (longitude !== null && Math.abs(longitude) > 180)) {
    throw new Error('Coordinates must be a valid pair or both unknown.');
  }
  const result: LibraryContent = {
    name: text(item.name), address: text(item.address), suburbId: nullableText(item.suburbId), latitude, longitude,
    description: text(item.description, true), officialUrl: url(item.officialUrl), sources,
    photos: list(item.photos).map((input) => {
      const photo = object(input);
      return { url: photoUrl(photo.url), alt: text(photo.alt), credit: text(photo.credit), sourceId: source(photo.sourceId) };
    }),
    facilities: { quietStudy: choice(facilities.quietStudy, factStatuses), groupStudy: choice(facilities.groupStudy, factStatuses),
      wheelchairAccess: choice(facilities.wheelchairAccess, factStatuses) },
    wifi: { status: choice(wifi.status, ['known', 'unknown']), networks: list(wifi.networks).map((input) => {
      const network = object(input);
      return { name: text(network.name), kind: choice(network.kind, ['public', 'institution', 'eduroam', 'restricted-guest', 'unknown']),
        eligibleCards: [...new Set(list(network.eligibleCards).map((card) => choice(card, cards)))],
        needsActiveCredentials: boolean(network.needsActiveCredentials), requirements: text(network.requirements),
        limits: nullableText(network.limits), helpUrl: url(network.helpUrl), sourceId: source(network.sourceId) };
    }) },
    schedule: { timeZone: choice(schedule.timeZone, [PERTH_TIME_ZONE]), building: calendar(schedule.building, sourceIds),
      access: list(schedule.access).map((input) => {
        const access = object(input);
        return { ...calendar(access, sourceIds), group: choice(access.group, ['public', 'unknown', ...cards]),
          requirement: text(access.requirement), needsActiveCredentials: boolean(access.needsActiveCredentials) };
      }) },
  };
  if (result.wifi.status === 'unknown' && result.wifi.networks.length) throw new Error('Unknown Wi-Fi cannot list confirmed networks.');
  if (new Set(result.schedule.access.map((access) => access.group)).size !== result.schedule.access.length) throw new Error('Duplicate entry group.');
  return result;
}
