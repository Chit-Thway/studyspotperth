import type { Institution, SearchFilters, UniversityCard } from './search-context';
import { INSTITUTION_CODES, UNIVERSITY_CARDS } from './search-context';
import { formatPerthTime, parsePerthTime } from './perth-time';
import { isLibrarySize, LIBRARY_SIZES } from './library-size';

export interface SearchOrigin { id: string; name: string; latitude: number; longitude: number }
export const FINDER_PAGE_SIZE = 10;
/** Approximate CBD reference point, not a location or opening-hours claim for a library. */
export const DEFAULT_ORIGIN: SearchOrigin = { id: 'perth-cbd', name: 'Perth CBD', latitude: -31.9523, longitude: 115.8613 };
export interface SearchRequest {
  start: number;
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
  return UNIVERSITY_CARDS.some((card) => card === value);
}
export function isInstitution(value: string): value is Institution { return value === 'public' || isUniversityCard(value); }

export const FINDER_QUERY_FIELDS: readonly string[] = ['start', 'suburb', 'cards', 'institutions', 'sizes', 'publicAccess', 'open24Hours', 'usableWifi',
  'quietStudy', 'groupStudy', 'wheelchairAccess', 'limit', 'offset'];

/** Migrate retired options without hiding invalid active values or duplicate parameters. */
export function normalizeSearchParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('end');
  const selected = next.getAll('institutions');
  if (selected.length === 1) {
    const institutions = selected[0].split(',');
    if (institutions.length <= INSTITUTION_CODES.length && institutions.every(isInstitution) && institutions.includes('public')) {
      const universities = institutions.filter((institution) => institution !== 'public');
      if (universities.length) next.set('institutions', universities.join(',')); else next.delete('institutions');
      if (!next.has('publicAccess')) next.set('publicAccess', 'true');
      const offset = next.getAll('offset');
      if (offset.length === 1 && /^\d+$/.test(offset[0]) && Number(offset[0]) <= 10000) next.delete('offset');
    }
  }
  return next;
}

/** Cards are session declarations, never institution selections or proof of entry. */
export function parseSearchRequest(rawParams: URLSearchParams, clock: number, origin = DEFAULT_ORIGIN): SearchRequest {
  if (rawParams.toString().length > 2048) throw new SearchValidationError('query', 'Search parameters are too long.');
  const params = normalizeSearchParams(rawParams);
  for (const [key] of params) {
    if (!FINDER_QUERY_FIELDS.includes(key)) throw new SearchValidationError(key, 'Unknown search parameter.');
    if (params.getAll(key).length !== 1) throw new SearchValidationError(key, 'Supply this parameter once.');
  }
  let start = clock;
  const selectedTime = params.get('start');
  if (selectedTime !== null) {
    try { start = parsePerthTime(selectedTime); } catch (error) {
      throw new SearchValidationError('start', error instanceof Error ? error.message : 'Invalid Perth time.');
    }
  }
  // Validate the supplied clock too, even when the search explicitly selects a time.
  try { parsePerthTime(formatPerthTime(clock).slice(0, 16)); } catch { throw new SearchValidationError('start', 'Invalid search clock.'); }
  const boolean = (field: string) => {
    const value = params.get(field);
    if (value === null || value === 'false') return false;
    if (value === 'true') return true;
    throw new SearchValidationError(field, 'Use true or false.');
  };
  const list = <T extends string>(field: string, accepts: (value: string) => value is T, maximum: number = INSTITUTION_CODES.length, label = 'institution codes'): T[] => {
    const value = params.get(field);
    if (value === null || value === '') return [];
    const items = value.split(',');
    if (items.length > maximum || !items.every(accepts)) throw new SearchValidationError(field, `Use supported ${label} separated by commas.`);
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
  return { start, origin, cards: list('cards', isUniversityCard), limit: integer('limit', FINDER_PAGE_SIZE, 1, 100), offset: integer('offset', 0, 0, 10000),
    filters: { institutions: list('institutions', isUniversityCard), sizes: list('sizes', isLibrarySize, LIBRARY_SIZES.length, 'library sizes'), publicAccess: boolean('publicAccess'), open24Hours: boolean('open24Hours'), usableWifi: boolean('usableWifi'),
      quietStudy: boolean('quietStudy'), groupStudy: boolean('groupStudy'), wheelchairAccess: boolean('wheelchairAccess') } };
}
