import { describe, expect, it } from 'vitest';
import { assertLocalDate, mergeIntervals, selectScheduleForDate, validateCalendar } from './schedule';
import { libraryFixtures } from '../../tests/fixtures/libraries';

const semester = libraryFixtures.find((fixture) => fixture.id === 'fixture-semester')!;
describe('schedule records', () => {
  it('uses period hours and lets an exact-date closure replace them', () => {
    expect(selectScheduleForDate(semester.content.schedule.building, '2026-10-14').intervals).toEqual([{ startMinute: 0, endMinute: 1440 }]);
    expect(selectScheduleForDate(semester.content.schedule.building, '2026-10-15')).toMatchObject({ status: 'closed', intervals: [], overrideId: 'one-day-closure' });
    expect(selectScheduleForDate(semester.content.schedule.building, '2026-11-01').intervals).toEqual([{ startMinute: 540, endMinute: 1020 }]);
  });
  it('preserves overnight minutes and an explicit full-day interval', () => {
    const overnight = libraryFixtures.find((fixture) => fixture.id === 'fixture-overnight')!;
    expect(selectScheduleForDate(overnight.content.schedule.building, '2026-10-02').intervals).toEqual([{ startMinute: 1200, endMinute: 1800 }]);
    const fullDay = libraryFixtures.find((fixture) => fixture.id === 'fixture-uwa')!;
    expect(fullDay.content.schedule.access.find((access) => access.group === 'uwa')?.recurring).toHaveLength(7);
    expect(selectScheduleForDate(fullDay.content.schedule.building, '2026-10-02').intervals).toEqual([{ startMinute: 0, endMinute: 1440 }]);
  });
  it('merges touching and overlapping intervals without mutating inputs', () => {
    const input = [{ startMinute: 900, endMinute: 1100 }, { startMinute: 540, endMinute: 900 }, { startMinute: 1000, endMinute: 1200 }];
    expect(mergeIntervals(input)).toEqual([{ startMinute: 540, endMinute: 1200 }]);
    expect(input[0].endMinute).toBe(1100);
  });
  it('rejects conflicting overrides of equal precedence', () => {
    const schedule = structuredClone(semester.content.schedule.building);
    schedule.overrides.push({ ...schedule.overrides[0], id: 'conflicting-semester' });
    expect(() => validateCalendar(schedule)).toThrow('Conflicting overrides');
  });
  it('does not turn unknown hours into known closure or availability', () => {
    const unknown = libraryFixtures.find((fixture) => fixture.id === 'fixture-unknown')!;
    expect(selectScheduleForDate(unknown.content.schedule.building, '2026-10-02')).toMatchObject({ status: 'unknown', intervals: [] });
  });
  it('rejects ambiguous equal times, invalid dates, and mismatched date weekdays', () => {
    expect(() => mergeIntervals([{ startMinute: 540, endMinute: 540 }])).toThrow('positive duration');
    expect(() => assertLocalDate('2026-02-30')).toThrow('valid');
    const schedule = structuredClone(semester.content.schedule.building);
    schedule.overrides[1] = { ...schedule.overrides[1], status: 'hours', intervals: [{ weekday: 0, startMinute: 540, endMinute: 1020 }] };
    expect(() => validateCalendar(schedule)).toThrow('weekday');
  });
});
