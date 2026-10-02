import { describe, expect, it } from 'vitest';
import { parseSearchRequest, SearchValidationError } from './search-request';
import { formatPerthTime, parsePerthTime } from './perth-time';

const clock = Date.parse('2026-10-02T06:00:30Z');
const request = (query: string) => parseSearchRequest(new URLSearchParams(query), clock);
describe('search request validation', () => {
  it('uses an explicit clock for open-now, in Perth regardless of host timezone', () => {
    expect(request('').start).toBe(clock);
    expect(formatPerthTime(clock)).toBe('2026-10-02T14:00:30+08:00');
    expect(parsePerthTime('2026-10-02T14:00')).toBe(Date.parse('2026-10-02T06:00:00Z'));
  });
  it('never turns declared cards into hard filters', () => {
    expect(request('cards=uwa,uwa,curtin')).toMatchObject({ cards: ['uwa', 'curtin'], filters: { institutions: [], open24Hours: false, usableWifi: false } });
    expect(request('institutions=uwa')).toMatchObject({ cards: [], filters: { institutions: ['uwa'] } });
  });
  it.each([
    'start=2026-02-30T14:00', 'start=2026-10-02T24:00', 'start=2026-10-02T14:60', 'start=2026-10-02T14:00Z',
    'start=', 'end=2026-10-02T14:00', 'end=2026-10-02T13:00', 'end=2026-12-01T14:00',
    'open24Hours=1', 'usableWifi=yes', 'cards=public', 'institutions=unknown', 'institutions=uwa,',
    'limit=0', 'limit=101', 'offset=-1', 'offset=1.5', 'suburb=', 'suburb=../private',
    'cards=uwa&cards=curtin', 'includeFixtures=true', 'start=1999-12-31T14:00',
  ])('rejects invalid query %s with a validation error', (query) => {
    expect(() => request(query)).toThrow(SearchValidationError);
  });
  it('accepts a next-day end and exact 31-day limit without relaxing any filters', () => {
    const result = request('start=2026-10-02T22:00&end=2026-10-03T06:00&open24Hours=true&institutions=uwa');
    expect(result.end! - result.start).toBe(8 * 60 * 60 * 1000);
    expect(result.filters).toMatchObject({ open24Hours: true, institutions: ['uwa'] });
    expect(request('start=2026-10-02T14:00&end=2026-11-02T14:00').end).not.toBeNull();
  });
});
