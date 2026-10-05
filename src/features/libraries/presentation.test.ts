import { describe, expect, it } from 'vitest';
import { libraryFixtures } from '../../../tests/fixtures/libraries';
import { evaluateLibrary } from '../../domain/library-search';
import { parseSearchRequest } from '../../domain/search-request';
import { parsePerthTime, perthMidnight } from '../../domain/perth-time';
import { calendarTimeline } from '../../domain/availability';
import type { CalendarSchedule } from '../../domain/schedule';
import { availabilityLabel, coverageLabel, dayHoursLabel, intervalLabel, directionsUrl } from './presentation';

const clock = parsePerthTime('2026-10-02T18:00');
function result(id: string, query = '') {
  const fixture = libraryFixtures.find((item) => item.id === `fixture-${id}`)!;
  return evaluateLibrary({ ...fixture, status: 'published', isFixture: true, revisionId: 'test-revision' }, parseSearchRequest(new URLSearchParams(query), clock));
}
describe('library explanations in the interface', () => {
  it('unmatched entry uses open wording and never claims personal availability', () => {
    const curtin = result('curtin');
    expect(curtin.access.status).toBe('unmatched');
    expect(availabilityLabel(curtin)).toMatch(/^Open /);
    expect(availabilityLabel(curtin)).not.toContain('Available');
  });
  it('finite windows never become indefinite 24/7 availability', () => {
    expect(availabilityLabel(result('uwa', 'cards=uwa'))).toBe('Access in checked period');
  });
  it('shows an end-time shortfall without changing the result', () => {
    const day = result('public', 'start=2026-10-02T14:00&end=2026-10-02T18:00');
    expect(availabilityLabel(day)).toMatch(/^Available until/);
    expect(coverageLabel(day)).toBe('1 hour short');
  });
  it('labels unknown and closed hours instead of availability', () => {
    expect(availabilityLabel(result('unknown'))).toBe('Opening hours unknown');
    expect(availabilityLabel(result('public'))).toBe('Closed at the selected start');
  });
  it('makes overnight minutes explicit and directions use destination coordinates', () => {
    expect(intervalLabel({ startMinute: 1200, endMinute: 1800 })).toBe('20:00–06:00 next day');
    expect(new URL(directionsUrl(result('uwa'))).searchParams.get('destination')).toBe('-31.95,115.86');
  });
  it('shows confirmed overnight hours alongside the unknown remainder', () => {
    const schedule: CalendarSchedule = { status: 'unknown', sourceId: null, recurring: [], overrides: [
      { id: 'exam-night', kind: 'date', startDate: '2026-10-09', endDate: '2026-10-09', status: 'hours',
        intervals: [{ weekday: 5, startMinute: 1200, endMinute: 1800 }], sourceId: 'source' },
    ] };
    expect(dayHoursLabel(calendarTimeline(schedule, '2026-10-10', 1), perthMidnight('2026-10-10')))
      .toBe('00:00–06:00 · remaining hours unknown');
    expect(dayHoursLabel(calendarTimeline(schedule, '2026-10-11', 1), perthMidnight('2026-10-11'))).toBe('Unknown');
    schedule.overrides.push({ id: 'closure', kind: 'date', startDate: '2026-10-10', endDate: '2026-10-10',
      status: 'closed', intervals: [], sourceId: 'source' });
    expect(dayHoursLabel(calendarTimeline(schedule, '2026-10-10', 1), perthMidnight('2026-10-10'))).toBe('Closed');
  });
});
