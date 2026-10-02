export const PERTH_TIME_ZONE = 'Australia/Perth';

/** Minutes from the start date's midnight; end may extend into the next day. */
export interface MinuteInterval { startMinute: number; endMinute: number }
/** Sunday = 0. Intervals are start-inclusive and end-exclusive. */
export interface WeeklyInterval extends MinuteInterval { weekday: number }
export interface ScheduleOverride {
  id: string;
  kind: 'date' | 'period';
  startDate: string;
  endDate: string;
  status: 'hours' | 'closed' | 'unknown';
  intervals: WeeklyInterval[];
  sourceId: string | null;
}
export interface CalendarSchedule {
  status: 'known' | 'unknown';
  recurring: WeeklyInterval[];
  overrides: ScheduleOverride[];
  sourceId: string | null;
}

export function assertLocalDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('Expected a valid YYYY-MM-DD date.');
  }
}

export function assertInterval(interval: MinuteInterval): void {
  if (!Number.isInteger(interval.startMinute) || !Number.isInteger(interval.endMinute)
    || interval.startMinute < 0 || interval.startMinute >= 1440
    || interval.endMinute <= interval.startMinute || interval.endMinute > interval.startMinute + 1440) {
    throw new Error('Intervals need a positive duration of at most 24 hours; use 0–1440 for a full day.');
  }
}

export function mergeIntervals(intervals: readonly MinuteInterval[]): MinuteInterval[] {
  const merged: MinuteInterval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.startMinute - b.startMinute)) {
    assertInterval(interval);
    const previous = merged.at(-1);
    if (previous && interval.startMinute <= previous.endMinute) {
      previous.endMinute = Math.max(previous.endMinute, interval.endMinute);
    } else merged.push({ startMinute: interval.startMinute, endMinute: interval.endMinute });
  }
  return merged;
}

export function validateCalendar(schedule: CalendarSchedule): void {
  const validateWeekly = (interval: WeeklyInterval) => {
    assertInterval(interval);
    if (!Number.isInteger(interval.weekday) || interval.weekday < 0 || interval.weekday > 6) {
      throw new Error('Weekday must be between 0 and 6.');
    }
  };
  schedule.recurring.forEach(validateWeekly);
  if (schedule.status === 'unknown' && schedule.recurring.length) throw new Error('Unknown hours cannot contain recurring intervals.');
  const ids = new Set<string>();
  for (const override of schedule.overrides) {
    if (ids.has(override.id)) throw new Error('Duplicate schedule override ID.');
    ids.add(override.id);
    assertLocalDate(override.startDate);
    assertLocalDate(override.endDate);
    if (override.startDate > override.endDate || (override.kind === 'date' && override.startDate !== override.endDate)) {
      throw new Error('Invalid schedule override date range.');
    }
    override.intervals.forEach(validateWeekly);
    if (override.status !== 'hours' && override.intervals.length) throw new Error('Closed or unknown overrides cannot contain intervals.');
    if (override.status === 'hours' && !override.intervals.length) throw new Error('Use a closure for an override with no opening hours.');
    if (override.kind === 'date' && override.intervals.some((interval) => interval.weekday !== new Date(`${override.startDate}T00:00:00Z`).getUTCDay())) {
      throw new Error('Date override intervals must match that date’s weekday.');
    }
  }
  for (let i = 0; i < schedule.overrides.length; i++) {
    for (const other of schedule.overrides.slice(i + 1)) {
      const current = schedule.overrides[i];
      if (current.kind === other.kind && current.startDate <= other.endDate && other.startDate <= current.endDate) {
        throw new Error('Conflicting overrides at the same precedence.');
      }
    }
  }
}

/** Exact date overrides replace period overrides, which replace recurring hours.
 * The returned intervals start on date. Consumers must clip overnight carry at
 * the next day's closures/overrides instead of treating this as an open-now check.
 */
export function selectScheduleForDate(schedule: CalendarSchedule, date: string) {
  assertLocalDate(date);
  validateCalendar(schedule);
  const applicable = schedule.overrides.filter((override) => override.startDate <= date && date <= override.endDate);
  const override = applicable.find((item) => item.kind === 'date') ?? applicable.find((item) => item.kind === 'period');
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const status = override ? (override.status === 'hours' ? 'known' : override.status) : schedule.status;
  const intervals = status === 'known'
    ? mergeIntervals((override?.intervals ?? schedule.recurring).filter((interval) => interval.weekday === weekday)) : [];
  return { status, intervals, sourceId: override?.sourceId ?? schedule.sourceId, overrideId: override?.id ?? null };
}
