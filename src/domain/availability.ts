import type { CalendarSchedule, ScheduleOverride } from './schedule';
import { calendarSelector } from './schedule';
import { formatPerthTime, perthMidnight, perthScheduleTime, shiftDate } from './perth-time';

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
  const selectDate = calendarSelector(schedule);
  const start = perthMidnight(startDate);
  const end = perthMidnight(shiftDate(startDate, days));
  const intervals: TimeInterval[] = [];
  const unknown: TimeInterval[] = [];
  let previous = selectDate(shiftDate(startDate, -1));
  for (let day = 0; day < days; day++) {
    const date = shiftDate(startDate, day);
    const midnight = perthMidnight(date);
    const nextMidnight = perthMidnight(shiftDate(date, 1));
    const selected = selectDate(date);
    const carry = previous.status === 'known' ? previous.intervals.filter((interval) => interval.endMinute > 1440)
      .map((interval) => ({ start: midnight, end: perthScheduleTime(date, interval.endMinute - 1440, 'end') })) : [];
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
        start: perthScheduleTime(date, interval.startMinute, 'start'),
        end: perthScheduleTime(date, Math.min(1440, interval.endMinute), 'end'),
      }));
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
