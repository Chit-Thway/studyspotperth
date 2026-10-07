import { describe, expect, it } from 'vitest';
import { libraryFixtures } from '../../../tests/fixtures/libraries';
import { evaluateLibrary } from '../../domain/library-search';
import { parseSearchRequest } from '../../domain/search-request';
import { parsePerthTime, perthMidnight } from '../../domain/perth-time';
import { calendarTimeline } from '../../domain/availability';
import type { CalendarSchedule } from '../../domain/schedule';
import { availabilityLabel, coverageLabel, dayHoursLabel, intervalLabel, directionsUrl, mapsLocationUrl, openingDayLabel, weeklyOpeningHours } from './presentation';
import { launchLibraries } from '../../../server/data/launch-libraries';

const clock = parsePerthTime('2026-10-02T18:00');
function result(id: string, query = '') {
  const fixture = libraryFixtures.find((item) => item.id === `fixture-${id}`)!;
  return evaluateLibrary({ ...fixture, status: 'published', isFixture: true, revisionId: 'test-revision' }, parseSearchRequest(new URLSearchParams(query), clock));
}
describe('library explanations in the interface', () => {
  it('shows Monday–Sunday public hours separately from round-the-clock card access', () => {
    const content = launchLibraries.find((record) => record.slug === 'tl-robertson-library')!.content;
    const current = parsePerthTime('2026-10-07T14:00');
    const publicHours = weeklyOpeningHours(content.schedule.access.find((entry) => entry.group === 'public')!, content.schedule.building, current);
    expect(publicHours.map((row) => row.day)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    expect(publicHours.every((row) => row.hours === '8 am–8 pm')).toBe(true);
    expect(weeklyOpeningHours(content.schedule.building, content.schedule.building, current)[0].hours).toBe('midnight–midnight (next day)');
    expect(weeklyOpeningHours(content.schedule.access[0], content.schedule.building, parsePerthTime('2026-10-11T12:00'))).toEqual(publicHours);
  });
  it('retains closures and unknown dates and clips entry hours to building hours', () => {
    const known: CalendarSchedule = { status: 'known', recurring: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], overrides: [], sourceId: null };
    const entry: CalendarSchedule = { ...known, recurring: [{ weekday: 1, startMinute: 480, endMinute: 1200 }] };
    const current = parsePerthTime('2026-10-07T14:00');
    expect(weeklyOpeningHours(entry, known, current)[0].hours).toBe('9 am–5 pm');
    expect(weeklyOpeningHours(known, known, current)[1].hours).toBe('Closed');
    const unknown: CalendarSchedule = { status: 'unknown', recurring: [], overrides: [], sourceId: null };
    expect(weeklyOpeningHours(unknown, known, current)[0].hours).toBe('Unknown');
    const content = launchLibraries.find((record) => record.slug === 'tl-robertson-library')!.content;
    expect(weeklyOpeningHours(content.schedule.access[0], content.schedule.building, parsePerthTime('2026-10-21T14:00')).every((row) => row.hours === 'Unknown')).toBe(true);
  });
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
  it('shows the next opening when closed, using weekdays and the visitor’s entry hours', () => {
    expect(openingDayLabel(result('public'))).toBe('Closed · Open 9 am–5 pm Sat');
    expect(openingDayLabel(result('public', 'start=2026-10-03T12:00'))).toBe('Open 9 am–5 pm Sat');
    expect(openingDayLabel(result('uwa'))).toBe('Closed · Open 9 am–5 pm Sat');
    expect(openingDayLabel(result('uwa', 'start=2026-10-07T23:48'))).toBe('Closed · Open 9 am–5 pm Thu');
    expect(openingDayLabel(result('uwa', 'start=2026-10-07T23:48&cards=uwa'))).toBe('Open 24 hours Wed');
  });
  it('uses replacement hours and closures instead of the ordinary schedule', () => {
    expect(openingDayLabel(result('semester'))).toBe('Card access only');
    expect(openingDayLabel(result('semester', 'cards=uwa'))).toBe('Open 24 hours Fri');
    expect(openingDayLabel(result('semester', 'start=2026-10-15T12:00&cards=uwa'))).toBe('Closed · Open 24 hours Fri');
    expect(openingDayLabel(result('unknown'))).toBe('Entry hours unknown');
    expect(openingDayLabel(result('overnight'))).toBe('Closed · Open 8 pm–6 am (next day) Fri');
    expect(openingDayLabel(result('overnight', 'start=2026-10-02T22:00'))).toBe('Open 8 pm–6 am (next day) Fri');
  });
  it.each(['tl-robertson-library', 'geoffrey-bolton-library'])('does not show round-the-clock building hours to a guest at %s', (slug) => {
    const library = launchLibraries.find((record) => record.slug === slug)!;
    const evaluate = (cards = '') => evaluateLibrary({ ...library, revisionId: 'test', status: 'published', isFixture: false },
      parseSearchRequest(new URLSearchParams({ start: '2026-10-07T23:48', cards }), parsePerthTime('2026-10-07T23:48')));
    expect(openingDayLabel(evaluate())).toBe(`Closed · Open 8 am–${slug === 'tl-robertson-library' ? '8' : '11'} pm Thu`);
    expect(openingDayLabel(evaluate(library.institution))).toBe('Open 24 hours Wed');
    expect(openingDayLabel(evaluate('uwa'))).not.toContain('24 hours');
  });
  it('shows the upcoming session rather than an already-ended slot in a split day', () => {
    const library = structuredClone(libraryFixtures.find((item) => item.id === 'fixture-public')!);
    const hours = [{ weekday: 3, startMinute: 540, endMinute: 720 }, { weekday: 3, startMinute: 780, endMinute: 1020 }];
    for (const schedule of [library.content.schedule.building, library.content.schedule.access[0]]) schedule.recurring = hours;
    const evaluated = evaluateLibrary({ ...library, revisionId: 'test', status: 'published', isFixture: true },
      parseSearchRequest(new URLSearchParams({ start: '2026-10-07T12:30' }), parsePerthTime('2026-10-07T12:30')));
    expect(openingDayLabel(evaluated)).toBe('Closed · Open 1 pm–5 pm Wed');
  });
  it('labels unknown and closed hours instead of availability', () => {
    expect(availabilityLabel(result('unknown'))).toBe('Opening hours unknown');
    expect(availabilityLabel(result('public'))).toBe('Closed at the selected start');
  });
  it('makes overnight minutes explicit and directions use destination coordinates', () => {
    expect(intervalLabel({ startMinute: 1200, endMinute: 1800 })).toBe('20:00–06:00 next day');
    expect(new URL(directionsUrl(result('uwa'))).searchParams.get('destination')).toBe('-31.95,115.86');
  });
  it('opens the library place using the full address with safely encoded punctuation', () => {
    const library = structuredClone(result('public'));
    library.library.content.address = 'Level 4, Smith & Co, Perth #1';
    const url = new URL(mapsLocationUrl(library));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe('Fictional Public Day Library, Level 4, Smith & Co, Perth #1');
    expect(url.hash).toBe('');
    expect(url.searchParams.has('origin')).toBe(false);
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
