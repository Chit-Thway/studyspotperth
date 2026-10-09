import { describe, expect, it } from 'vitest';
import { formatPerthTime, parsePerthTime, perthMidnight, shiftDate } from './perth-time';
import { calendarTimeline, intervalAt } from './availability';
import type { CalendarSchedule } from './schedule';
import { dayHoursLabel } from '../features/libraries/presentation';
import { libraryFixtures } from '../../tests/fixtures/libraries';
import { evaluateLibrary } from './library-search';
import { parseSearchRequest } from './search-request';

const daily = (startMinute = 0, endMinute = 1440): CalendarSchedule => ({ status: 'known', sourceId: 'test-source', overrides: [],
  recurring: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute, endMinute })) });

describe('Perth historical offsets and calendar days', () => {
  it('matches IANA formatting at midnight and on both sides of historical transitions', () => {
    const reference = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' });
    for (const utc of ['2000-01-01T00:00:00Z', '2006-12-02T17:59:59Z', '2006-12-02T18:00:00Z', '2006-12-03T15:00:00Z',
      '2007-03-24T17:59:59Z', '2007-03-24T18:00:00Z', '2007-10-27T18:00:00Z', '2008-03-29T18:00:00Z',
      '2008-10-25T18:00:00Z', '2009-03-28T18:00:00Z', '2026-10-09T16:00:00.123Z', '2100-12-31T15:59:59Z']) {
      const instant = Date.parse(utc);
      const parts = reference.formatToParts(instant);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
      expect(formatPerthTime(instant)).toBe(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}${part('timeZoneName').replace('GMT', '')}`);
    }
  });
  it('retains DST and date validation after bounded caches evict old dates', () => {
    for (let day = 0; day < 300; day++) formatPerthTime(perthMidnight(shiftDate('2098-01-01', day)));
    expect(parsePerthTime('2007-03-25T02:30')).toBe(Date.parse('2007-03-24T17:30:00Z'));
    expect(() => parsePerthTime('2006-12-03T02:30')).toThrow();
    expect(() => perthMidnight('2026-02-30')).toThrow();
  });
  it('revalidates changed schedules rather than caching old library facts', () => {
    const schedule = daily(540, 1020);
    expect(calendarTimeline(schedule, '2026-10-09', 1).intervals[0].start).toBe(parsePerthTime('2026-10-09T09:00'));
    schedule.recurring = daily().recurring;
    const fullDay = calendarTimeline(schedule, '2026-10-09', 1);
    expect(fullDay.intervals).toEqual([{ start: fullDay.start, end: fullDay.end }]);
    schedule.recurring[0].endMinute = -1;
    expect(() => calendarTimeline(schedule, '2026-10-09', 1)).toThrow();
  });
  it.each([
    ['2000-01-01T12:00', '2000-01-01T04:00:00Z', '+08:00'],
    ['2007-01-01T12:00', '2007-01-01T03:00:00Z', '+09:00'],
    ['2007-07-01T12:00', '2007-07-01T04:00:00Z', '+08:00'],
    ['2008-01-01T12:00', '2008-01-01T03:00:00Z', '+09:00'],
    ['2009-01-01T12:00', '2009-01-01T03:00:00Z', '+09:00'],
    ['2026-10-05T12:00', '2026-10-05T04:00:00Z', '+08:00'],
    ['2100-12-31T12:00', '2100-12-31T04:00:00Z', '+08:00'],
  ])('round trips %s with its actual offset', (local, utc, offset) => {
    const instant = Date.parse(utc);
    expect(parsePerthTime(local)).toBe(instant);
    expect(formatPerthTime(instant)).toBe(`${local}:00${offset}`);
    expect(Date.parse(formatPerthTime(instant))).toBe(instant);
  });
  it('formats both occurrences of a repeated minute with distinct offsets', () => {
    expect(formatPerthTime(Date.parse('2007-03-24T17:30:00Z'))).toBe('2007-03-25T02:30:00+09:00');
    expect(formatPerthTime(Date.parse('2007-03-24T18:30:00Z'))).toBe('2007-03-25T02:30:00+08:00');
    // A form value has no offset: consistently choose the earlier occurrence.
    expect(parsePerthTime('2007-03-25T02:30')).toBe(Date.parse('2007-03-24T17:30:00Z'));
  });
  it('rejects nonexistent input minutes and retains the supported range', () => {
    expect(() => parsePerthTime('2006-12-03T02:30')).toThrow();
    for (const local of ['1999-12-31T12:00', '2101-01-01T12:00', '2007-02-30T12:00', '2007-01-01T24:00']) {
      expect(() => parsePerthTime(local)).toThrow();
    }
  });
  it.each([['2006-12-03', 23], ['2007-03-25', 25]] as const)('bounds %s by local midnights (%s elapsed hours)', (date, hours) => {
    const timeline = calendarTimeline(daily(), date, 1);
    expect(timeline.end - timeline.start).toBe(hours * 3_600_000);
    expect(timeline.intervals).toEqual([{ start: timeline.start, end: timeline.end }]);
    expect(formatPerthTime(timeline.start).slice(11, 19)).toBe('00:00:00');
    expect(formatPerthTime(timeline.end).slice(11, 19)).toBe('00:00:00');
    expect(dayHoursLabel(timeline, perthMidnight(date))).toBe('24 hours');
    const offices = calendarTimeline(daily(480, 1020), date, 2);
    for (const interval of offices.intervals) {
      expect(formatPerthTime(interval.start).slice(11, 16)).toBe('08:00');
      expect(formatPerthTime(interval.end).slice(11, 16)).toBe('17:00');
    }
    expect(dayHoursLabel(calendarTimeline(daily(480, 1020), date, 1), perthMidnight(date))).toBe('08:00–17:00');
  });
  it('preserves overnight carry to the actual local end after an offset transition', () => {
    const schedule = daily(1200, 1800);
    const timeline = calendarTimeline(schedule, '2006-12-03', 1);
    expect(formatPerthTime(timeline.intervals[0].end)).toBe('2006-12-03T06:00:00+09:00');
    expect(intervalAt(timeline.intervals, parsePerthTime('2006-12-03T05:59'))).toBeDefined();
    expect(intervalAt(timeline.intervals, parsePerthTime('2006-12-03T06:00'))).toBeUndefined();
  });
  it('keeps unknown daily bounds at midnight during a transition', () => {
    const timeline = calendarTimeline({ status: 'unknown', sourceId: null, recurring: [], overrides: [] }, '2006-12-03', 2);
    expect(timeline.unknown).toEqual([{ start: timeline.start, end: timeline.end }]);
    expect(formatPerthTime(timeline.end)).toBe('2006-12-05T00:00:00+09:00');
  });
  it('includes both occurrences of repeated schedule hours and shifts skipped boundaries forward', () => {
    const repeated = calendarTimeline(daily(120, 150), '2007-03-25', 1).intervals[0];
    expect(formatPerthTime(repeated.start)).toBe('2007-03-25T02:00:00+09:00');
    expect(formatPerthTime(repeated.end)).toBe('2007-03-25T02:30:00+08:00');
    expect(repeated.end - repeated.start).toBe(90 * 60_000);
    const skipped = calendarTimeline(daily(150, 240), '2006-12-03', 1).intervals[0];
    expect(formatPerthTime(skipped.start)).toBe('2006-12-03T03:30:00+09:00');
    expect(formatPerthTime(skipped.end)).toBe('2006-12-03T04:00:00+09:00');
  });
  it.each(['2006-11-30', '2007-03-22'])('verifies 24/7 over seven local dates from %s', (date) => {
    const fixture = structuredClone(libraryFixtures.find((library) => library.id === 'fixture-public')!);
    fixture.content.schedule.building = daily();
    fixture.content.schedule.access = [{ ...daily(), group: 'public', requirement: 'Public access', needsActiveCredentials: false }];
    const result = evaluateLibrary({ ...fixture, status: 'published', isFixture: true, revisionId: 'test' },
      parseSearchRequest(new URLSearchParams(`start=${date}T12:00`), Date.parse('2026-10-05T04:00:00Z')));
    expect(result.open24Hours.status).toBe('qualifies');
    expect(result.open24Hours.groups[0].verifiedUntil).toBe(`${date === '2006-11-30' ? '2006-12-07' : '2007-03-29'}T00:00:00${date === '2006-11-30' ? '+09:00' : '+08:00'}`);
  });
  it('does not award 24/7 when a fall-back week closes an hour before its final midnight', () => {
    const fixture = structuredClone(libraryFixtures.find((library) => library.id === 'fixture-public')!);
    fixture.content.schedule.building = daily();
    fixture.content.schedule.access = [{ ...daily(), group: 'public', requirement: 'Public access', needsActiveCredentials: false,
      overrides: [{ id: 'early-close', kind: 'date', startDate: '2007-03-28', endDate: '2007-03-28', status: 'hours',
        intervals: [{ weekday: 3, startMinute: 0, endMinute: 1380 }], sourceId: 'test-source' }] }];
    const result = evaluateLibrary({ ...fixture, status: 'published', isFixture: true, revisionId: 'test' },
      parseSearchRequest(new URLSearchParams('start=2007-03-22T12:00'), Date.parse('2026-10-05T04:00:00Z')));
    expect(result.open24Hours.status).toBe('does-not-qualify');
  });
});
