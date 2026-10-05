import type { Institution, SearchFilters, UniversityCard } from './search-context';
import { DAY_MS, formatPerthTime, parsePerthTime } from './perth-time';

export interface SearchOrigin { id: string; name: string; latitude: number; longitude: number }
/** Approximate CBD reference point, not a location or opening-hours claim for a library. */
export const DEFAULT_ORIGIN: SearchOrigin = { id: 'perth-cbd', name: 'Perth CBD', latitude: -31.9523, longitude: 115.8613 };
export interface SearchRequest {
  start: number;
  end: number | null;
  origin: SearchOrigin;
  cards: readonly UniversityCard[];
  filters: SearchFilters;
  limit: number;
  offset: number;
}
export class SearchValidationError extends Error {
  constructor(public readonly field: string, message: string) { super(message); }
}
export function isUniversityCard(value: string): value is UniversityCard {
  return value === 'uwa' || value === 'curtin' || value === 'ecu' || value === 'murdoch';
}
export function isInstitution(value: string): value is Institution { return value === 'public' || isUniversityCard(value); }

export const FINDER_QUERY_FIELDS: readonly string[] = ['start', 'end', 'suburb', 'cards', 'institutions', 'open24Hours', 'usableWifi',
  'quietStudy', 'groupStudy', 'wheelchairAccess', 'limit', 'offset'];

/** Cards are session declarations, never institution selections or proof of entry. */
export function parseSearchRequest(params: URLSearchParams, clock: number, origin = DEFAULT_ORIGIN): SearchRequest {
  if (params.toString().length > 2048) throw new SearchValidationError('query', 'Search parameters are too long.');
  for (const [key] of params) {
    if (!FINDER_QUERY_FIELDS.includes(key)) throw new SearchValidationError(key, 'Unknown search parameter.');
    if (params.getAll(key).length !== 1) throw new SearchValidationError(key, 'Supply this parameter once.');
  }
  const time = (field: 'start' | 'end') => {
    const value = params.get(field);
    if (value === null) return null;
    try { return parsePerthTime(value); } catch (error) {
      throw new SearchValidationError(field, error instanceof Error ? error.message : 'Invalid Perth time.');
    }
  };
  const start = time('start') ?? clock;
  // Validate the supplied clock too, even when the search explicitly selects a time.
  try { parsePerthTime(formatPerthTime(clock).slice(0, 16)); } catch { throw new SearchValidationError('start', 'Invalid search clock.'); }
  const end = time('end');
  if (end !== null && end <= start) throw new SearchValidationError('end', 'End must be after the requested start.');
  if (end !== null && end - start > 31 * DAY_MS) throw new SearchValidationError('end', 'A study session can span at most 31 days.');
  const boolean = (field: string) => {
    const value = params.get(field);
    if (value === null || value === 'false') return false;
    if (value === 'true') return true;
    throw new SearchValidationError(field, 'Use true or false.');
  };
  const list = <T extends string>(field: string, accepts: (value: string) => value is T): T[] => {
    const value = params.get(field);
    if (value === null || value === '') return [];
    const items = value.split(',');
    if (items.length > 5 || !items.every(accepts)) throw new SearchValidationError(field, 'Use supported institution codes separated by commas.');
    return [...new Set(items)];
  };
  const integer = (field: string, fallback: number, min: number, max: number) => {
    const value = params.get(field);
    if (value === null) return fallback;
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new SearchValidationError(field, `Use a whole number from ${min} to ${max}.`);
    return Number(value);
  };
  if (params.has('suburb') && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.get('suburb')!)) {
    throw new SearchValidationError('suburb', 'Use a valid suburb ID.');
  }
  return { start, end, origin, cards: list('cards', isUniversityCard), limit: integer('limit', 50, 1, 100), offset: integer('offset', 0, 0, 10000),
    filters: { institutions: list('institutions', isInstitution), open24Hours: boolean('open24Hours'), usableWifi: boolean('usableWifi'),
      quietStudy: boolean('quietStudy'), groupStudy: boolean('groupStudy'), wheelchairAccess: boolean('wheelchairAccess') } };
}
