import type { CalendarSchedule, ScheduleOverride } from './schedule';
import { selectScheduleForDate } from './schedule';
import { DAY_MS, formatPerthTime, MINUTE_MS, perthMidnight, shiftDate } from './perth-time';

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
  const intersections: TimeInterval[] = [];
  for (const left of a) for (const right of b) {
    const start = Math.max(left.start, right.start);
    const end = Math.min(left.end, right.end);
    if (start < end) intersections.push({ start, end });
  }
  return mergeTimeIntervals(intersections);
}

/** Bound each day separately so an overnight interval cannot bypass an override.
 * Ordinary receiving days preserve an explicit overnight end. A new override
 * on the receiving day permits carry only inside that day's replacement hours.
 */
export function calendarTimeline(schedule: CalendarSchedule, startDate: string, days = 32): ScheduleTimeline {
  if (!Number.isInteger(days) || days < 1 || days > 32) throw new Error('Evaluation window must be 1–32 days.');
  const start = perthMidnight(startDate);
  const end = start + days * DAY_MS;
  const intervals: TimeInterval[] = [];
  const unknown: TimeInterval[] = [];
  let previous = selectScheduleForDate(schedule, shiftDate(startDate, -1));
  for (let day = 0; day < days; day++) {
    const date = shiftDate(startDate, day);
    const midnight = start + day * DAY_MS;
    const selected = selectScheduleForDate(schedule, date);
    if (selected.status === 'unknown') unknown.push({ start: midnight, end: midnight + DAY_MS });
    if (selected.status === 'known') {
      const current = selected.intervals.map((interval) => ({
        start: midnight + interval.startMinute * MINUTE_MS,
        end: midnight + Math.min(1440, interval.endMinute) * MINUTE_MS,
      }));
      const carry = previous.status === 'known' ? previous.intervals.filter((interval) => interval.endMinute > 1440)
        .map((interval) => ({ start: midnight, end: midnight + (interval.endMinute - 1440) * MINUTE_MS })) : [];
      const preservesCarry = selected.overrideId === null || selected.overrideId === previous.overrideId;
      intervals.push(...current, ...(preservesCarry ? carry : intersectIntervals(carry, current)));
    }
    previous = selected;
  }
  return { start, end, intervals: mergeTimeIntervals(intervals), unknown: mergeTimeIntervals(unknown),
    exceptions: schedule.overrides.filter((override) => override.startDate < shiftDate(startDate, days) && override.endDate >= startDate) };
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
