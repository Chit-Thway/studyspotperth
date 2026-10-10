import type { CalendarSchedule, ScheduleOverride } from './schedule';
import { calendarSelector } from './schedule';
import { DAY_MS, MINUTE_MS, formatPerthTime, perthMidnight, perthScheduleTime, shiftDate } from './perth-time';

export interface TimeInterval { start: number; end: number }
export interface ScheduleTimeline {
  intervals: TimeInterval[];
  unknown: TimeInterval[];
  start: number;
  end: number;
  exceptions: ScheduleOverride[];
}
export interface ContinuousWindow {
  from: string;
  until: string;
  endReason: 'closes' | 'unknown' | 'verification-limit';
}

export function mergeTimeIntervals(intervals: readonly TimeInterval[]): TimeInterval[] {
  const result: TimeInterval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    if (interval.end <= interval.start) continue;
    const previous = result.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else result.push({ ...interval });
  }
  return result;
}

export function intersectIntervals(a: readonly TimeInterval[], b: readonly TimeInterval[]): TimeInterval[] {
  // Timelines are already merged. Normalize other callers without re-sorting timelines.
  const ordered = (intervals: readonly TimeInterval[]) => intervals.some((interval, index) => interval.end <= interval.start
    || index > 0 && interval.start <= intervals[index - 1].end) ? mergeTimeIntervals(intervals) : intervals;
  const left = ordered(a);
  const right = ordered(b);
  const intersections: TimeInterval[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (start < end) intersections.push({ start, end });
    if (left[i].end < right[j].end) i++;
    else j++;
  }
  return intersections;
}

/** Bound each day separately so an overnight interval cannot bypass an override.
 * Ordinary receiving days preserve an explicit overnight end. A new override
 * on the receiving day permits carry only inside that day's replacement hours.
 */
export function calendarTimeline(schedule: CalendarSchedule, startDate: string, days = 32): ScheduleTimeline {
  return createCalendarTimelineReader(startDate, days)(schedule);
}

/** Share immutable date boundaries within one search, never user/schedule data across requests. */
export function createCalendarTimelineReader(startDate: string, days = 32) {
  if (!Number.isInteger(days) || days < 1 || days > 32) throw new Error('Evaluation window must be 1–32 days.');
  const start = perthMidnight(startDate);
  const endDate = shiftDate(startDate, days);
  const end = perthMidnight(endDate);
  const previousDate = shiftDate(startDate, -1);
  const boundaries = Array.from({ length: days + 1 }, (_, day) => {
    const date = shiftDate(startDate, day);
    return { date, midnight: perthMidnight(date) };
  });
  return (schedule: CalendarSchedule): ScheduleTimeline => {
    const selectDate = calendarSelector(schedule);
    const intervals: TimeInterval[] = [];
    const unknown: TimeInterval[] = [];
    let previous = selectDate(previousDate);
    for (let day = 0; day < days; day++) {
      const { date, midnight } = boundaries[day];
      const nextMidnight = boundaries[day + 1].midnight;
      const regularDay = nextMidnight - midnight === DAY_MS;
      const selected = selectDate(date);
      const carry = previous.status === 'known' ? previous.intervals.filter((interval) => interval.endMinute > 1440)
        .map((interval) => ({ start: midnight, end: regularDay ? midnight + (interval.endMinute - 1440) * MINUTE_MS
          : perthScheduleTime(date, interval.endMinute - 1440, 'end') })) : [];
      if (selected.status === 'unknown') {
        // An unknown ordinary baseline does not erase a confirmed overnight end.
        // Explicit receiving-day overrides remain authoritative.
        const confirmed = selected.overrideId === null ? carry : [];
        intervals.push(...confirmed);
        const unknownFrom = Math.max(midnight, ...confirmed.map((interval) => interval.end));
        if (unknownFrom < nextMidnight) unknown.push({ start: unknownFrom, end: nextMidnight });
      }
      if (selected.status === 'known') {
        const current = selected.intervals.map((interval) => ({
          start: regularDay ? midnight + interval.startMinute * MINUTE_MS : perthScheduleTime(date, interval.startMinute, 'start'),
          end: regularDay ? midnight + Math.min(1440, interval.endMinute) * MINUTE_MS : perthScheduleTime(date, Math.min(1440, interval.endMinute), 'end'),
        }));
        const preservesCarry = selected.overrideId === null || selected.overrideId === previous.overrideId;
        intervals.push(...current, ...(preservesCarry ? carry : intersectIntervals(carry, current)));
      }
      previous = selected;
    }
    return { start, end, intervals: mergeTimeIntervals(intervals), unknown: mergeTimeIntervals(unknown),
      exceptions: schedule.overrides.filter((override) => override.startDate < endDate && override.endDate >= startDate) };
  };
}

export function intervalAt(intervals: readonly TimeInterval[], timestamp: number): TimeInterval | undefined {
  return intervals.find((interval) => interval.start <= timestamp && timestamp < interval.end);
}

export function continuousWindow(intervals: readonly TimeInterval[], timestamp: number, end: number,
  unknown: readonly TimeInterval[]): ContinuousWindow | null {
  const interval = intervalAt(intervals, timestamp);
  if (!interval) return null;
  return { from: formatPerthTime(interval.start), until: formatPerthTime(interval.end),
    endReason: interval.end === end ? 'verification-limit' : intervalAt(unknown, interval.end) ? 'unknown' : 'closes' };
}
