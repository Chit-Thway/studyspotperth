import { describe, expect, it } from 'vitest';
import { libraryFixtures } from '../../tests/fixtures/libraries';
import { calendarTimeline, continuousWindow, intervalAt } from './availability';
import { parsePerthTime } from './perth-time';

const overnight = () => structuredClone(libraryFixtures.find((fixture) => fixture.id === 'fixture-overnight')!.content.schedule.building);
describe('calendar availability boundaries', () => {
  it.each(['date', 'period'] as const)('preserves an overnight %s override when ordinary known hours resume', (kind) => {
    const schedule = overnight();
    schedule.overrides = [{ id: 'friday-hours', kind, startDate: kind === 'date' ? '2026-10-02' : '2026-10-01', endDate: '2026-10-02', status: 'hours',
      intervals: [{ weekday: 5, startMinute: 1200, endMinute: 1800 }], sourceId: 'fictional-source' }];
    const timeline = calendarTimeline(schedule, '2026-10-02');
    expect(continuousWindow(timeline.intervals, parsePerthTime('2026-10-02T22:00'), timeline.end, timeline.unknown)?.until)
      .toBe('2026-10-03T06:00:00+08:00');
    // Also test a search whose first evaluated date is the receiving Saturday.
    const saturday = calendarTimeline(schedule, '2026-10-03');
    expect(intervalAt(saturday.intervals, parsePerthTime('2026-10-03T01:00'))).toBeDefined();
    expect(intervalAt(saturday.intervals, parsePerthTime('2026-10-03T06:00'))).toBeUndefined();
  });
  it.each(['closed', 'unknown', 'hours'] as const)('still applies receiving-day %s overrides after an overnight date exception', (status) => {
    const schedule = overnight();
    schedule.overrides = [
      { id: 'friday-hours', kind: 'date', startDate: '2026-10-02', endDate: '2026-10-02', status: 'hours',
        intervals: [{ weekday: 5, startMinute: 1200, endMinute: 1800 }], sourceId: 'fictional-source' },
      { id: 'saturday-exception', kind: 'date', startDate: '2026-10-03', endDate: '2026-10-03', status,
        intervals: status === 'hours' ? [{ weekday: 6, startMinute: 540, endMinute: 1020 }] : [], sourceId: status === 'unknown' ? null : 'fictional-source' },
    ];
    const timeline = calendarTimeline(schedule, '2026-10-02');
    expect(continuousWindow(timeline.intervals, parsePerthTime('2026-10-02T22:00'), timeline.end, timeline.unknown))
      .toMatchObject({ until: '2026-10-03T00:00:00+08:00', endReason: status === 'unknown' ? 'unknown' : 'closes' });
    expect(intervalAt(timeline.intervals, parsePerthTime('2026-10-03T01:00'))).toBeUndefined();
    if (status === 'hours') expect(intervalAt(timeline.intervals, parsePerthTime('2026-10-03T09:00'))).toBeDefined();
  });
  it('clips incoming overnight hours at a full closure', () => {
    const schedule = overnight();
    schedule.overrides = [{ id: 'closed', kind: 'date', startDate: '2026-10-03', endDate: '2026-10-03', status: 'closed', intervals: [], sourceId: 'fictional-source' }];
    const timeline = calendarTimeline(schedule, '2026-10-02');
    const window = continuousWindow(timeline.intervals, parsePerthTime('2026-10-02T22:00'), timeline.end, timeline.unknown);
    expect(window?.until).toBe('2026-10-03T00:00:00+08:00');
    expect(intervalAt(timeline.intervals, parsePerthTime('2026-10-03T01:00'))).toBeUndefined();
  });
  it('respects replacement hours and does not resurrect the previous night', () => {
    const schedule = overnight();
    schedule.overrides = [{ id: 'late-opening', kind: 'date', startDate: '2026-10-03', endDate: '2026-10-03', status: 'hours',
      intervals: [{ weekday: 6, startMinute: 540, endMinute: 1020 }], sourceId: 'fictional-source' }];
    const timeline = calendarTimeline(schedule, '2026-10-03');
    expect(intervalAt(timeline.intervals, parsePerthTime('2026-10-03T01:00'))).toBeUndefined();
    expect(intervalAt(timeline.intervals, parsePerthTime('2026-10-03T09:00'))).toBeDefined();
  });
  it('stops a continuous window at future uncertainty and labels the reason', () => {
    const schedule = overnight();
    schedule.overrides = [{ id: 'unknown', kind: 'date', startDate: '2026-10-03', endDate: '2026-10-03', status: 'unknown', intervals: [], sourceId: null }];
    const timeline = calendarTimeline(schedule, '2026-10-02');
    expect(continuousWindow(timeline.intervals, parsePerthTime('2026-10-02T22:00'), timeline.end, timeline.unknown))
      .toMatchObject({ until: '2026-10-03T00:00:00+08:00', endReason: 'unknown' });
  });
  it('carries a normal Sunday overnight interval into Monday with no new starts', () => {
    const schedule = overnight();
    schedule.recurring = [{ weekday: 0, startMinute: 1200, endMinute: 1800 }];
    const timeline = calendarTimeline(schedule, '2026-10-05');
    expect(intervalAt(timeline.intervals, parsePerthTime('2026-10-05T01:00'))).toBeDefined();
    expect(intervalAt(timeline.intervals, parsePerthTime('2026-10-05T06:00'))).toBeUndefined();
  });
  it('merges touching intervals and labels the finite horizon instead of infinity', () => {
    const schedule = overnight();
    schedule.recurring = Array.from({ length: 7 }, (_, weekday) => [{ weekday, startMinute: 0, endMinute: 720 }, { weekday, startMinute: 720, endMinute: 1440 }]).flat();
    const timeline = calendarTimeline(schedule, '2026-10-02');
    expect(continuousWindow(timeline.intervals, parsePerthTime('2026-10-02T12:00'), timeline.end, timeline.unknown))
      .toMatchObject({ until: '2026-11-03T00:00:00+08:00', endReason: 'verification-limit' });
  });
});
