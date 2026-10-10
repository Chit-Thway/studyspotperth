import { describe, expect, it } from 'vitest';
import { parseSearchRequest, SearchValidationError } from './search-request';
import { formatPerthTime, parsePerthTime } from './perth-time';

const clock = Date.parse('2026-10-02T06:00:30Z');
const request = (query: string) => parseSearchRequest(new URLSearchParams(query), clock);
describe('search request validation', () => {
  it('uses an explicit clock for open-now, in Perth regardless of host timezone', () => {
    expect(request('').limit).toBe(10);
    expect(request('').start).toBe(clock);
    expect(formatPerthTime(clock)).toBe('2026-10-02T14:00:30+08:00');
    expect(parsePerthTime('2026-10-02T14:00')).toBe(Date.parse('2026-10-02T06:00:00Z'));
  });
  it('never turns declared cards into hard filters', () => {
    expect(request('cards=notre-dame')).toMatchObject({ cards: ['notre-dame'], filters: { institutions: [] } });
    expect(request('institutions=notre-dame')).toMatchObject({ cards: [], filters: { institutions: ['notre-dame'] } });
    expect(request('cards=uwa,uwa,curtin')).toMatchObject({ cards: ['uwa', 'curtin'], filters: { institutions: [], open24Hours: false, usableWifi: false } });
    expect(request('institutions=uwa')).toMatchObject({ cards: [], filters: { institutions: ['uwa'] } });
  });
  it('accepts multiple size selections and rejects unsupported sizes', () => {
    expect(request('').filters.sizes).toEqual([]);
    expect(request('sizes=small,large,small').filters.sizes).toEqual(['small', 'large']);
    expect(() => request('sizes=huge')).toThrow(SearchValidationError);
  });
  it('migrates public institution links into an independent access filter and resets their old page', () => {
    expect(request('institutions=public,uwa&offset=10')).toMatchObject({ offset: 0, filters: { institutions: ['uwa'], publicAccess: true } });
    expect(request('institutions=public&publicAccess=false')).toMatchObject({ filters: { institutions: [], publicAccess: false } });
    expect(request('publicAccess=true&institutions=uwa,curtin')).toMatchObject({ filters: { institutions: ['uwa', 'curtin'], publicAccess: true } });
    expect(() => request('institutions=public&institutions=uwa')).toThrow(SearchValidationError);
    expect(() => request('institutions=public,unknown')).toThrow(SearchValidationError);
    expect(() => request('publicAccess=yes')).toThrow(SearchValidationError);
    expect(() => request('institutions=public&offset=-1')).toThrow(SearchValidationError);
    expect(() => request('institutions=public&offset=1&offset=2')).toThrow(SearchValidationError);
  });
  it.each([
    'start=2026-02-30T14:00', 'start=2026-10-02T24:00', 'start=2026-10-02T14:60', 'start=2026-10-02T14:00Z',
    'start=',
    'open24Hours=1', 'usableWifi=yes', 'cards=public', 'institutions=unknown', 'institutions=uwa,',
    'limit=0', 'limit=101', 'offset=-1', 'offset=1.5', 'suburb=', 'suburb=../private',
    'cards=uwa&cards=curtin', 'includeFixtures=true', 'start=1999-12-31T14:00',
  ])('rejects invalid query %s with a validation error', (query) => {
    expect(() => request(query)).toThrow(SearchValidationError);
  });
  it.each(['end=2026-10-03T06:00', 'end=2000-01-01T00:00', 'end=invalid', 'end=', 'end=invalid&end=duplicate'])('ignores legacy %s without changing the selected time or filters', (end) => {
    const selected = 'start=2026-10-02T22:00&cards=&open24Hours=true&institutions=uwa';
    expect(request(`${selected}&${end}`)).toEqual(request(selected));
    expect(request(`${selected}&${end}`)).not.toHaveProperty('end');
  });
  it('ignores old end times for current-time searches while retaining validation of active fields', () => {
    expect(request('end=2000-01-01T00:00')).toEqual(request(''));
    expect(() => request('end=invalid&cards=uwa&cards=curtin')).toThrow(SearchValidationError);
    expect(() => request('end=invalid&unexpected=true')).toThrow(SearchValidationError);
  });
});
