import { describe, expect, it } from 'vitest';
import { emptyLibraryContent, parseAdminContent, validateAdminPublication } from './admin';
import { calendarTimeline, intervalAt } from './availability';
import { evaluateLibrary, searchLibraries } from './library-search';
import type { LibraryRecord } from './library';
import { parsePerthTime } from './perth-time';
import type { ScheduleOverride } from './schedule';
import { parseSearchRequest } from './search-request';

const clock = parsePerthTime('2026-10-05T14:00');
const request = (query: string) => parseSearchRequest(new URLSearchParams(query), clock);
function library(kind: ScheduleOverride['kind'] = 'date'): LibraryRecord {
  const content = emptyLibraryContent();
  content.name = 'Synthetic exam-night library'; content.address = 'Synthetic address';
  content.sources = [{ id: 'source', kind: 'official', label: 'Confirmed overnight opening', url: 'https://example.invalid/library', checkedOn: '2026-10-05' }];
  content.schedule.building.overrides = [{ id: 'exam-night', kind, startDate: kind === 'date' ? '2026-10-09' : '2026-10-08', endDate: '2026-10-09', status: 'hours',
    intervals: [{ weekday: 5, startMinute: 1200, endMinute: 1800 }], sourceId: 'source' }];
  content.schedule.access = [{ ...structuredClone(content.schedule.building), group: 'public', requirement: 'Public entry', needsActiveCredentials: false }];
  const validated = parseAdminContent(content);
  validateAdminPublication(validated);
  return { id: 'synthetic', slug: 'synthetic', institution: 'public', status: 'published', isFixture: false, revisionId: 'revision', content: validated };
}

describe('confirmed overnight exceptions against unknown baseline hours', () => {
  it.each(['date', 'period'] as const)('keeps confirmed %s hours and session coverage through 06:00', (kind) => {
    const record = library(kind);
    const evening = evaluateLibrary(record, request('start=2026-10-09T22:00&end=2026-10-10T05:00'));
    expect(evening.opening.window).toMatchObject({ until: '2026-10-10T06:00:00+08:00', endReason: 'unknown' });
    expect(evening.access.window?.until).toBe('2026-10-10T06:00:00+08:00');
    expect(evening.coverage.status).toBe('covered');
    const morning = searchLibraries([record], request('start=2026-10-10T01:00&end=2026-10-10T06:00'));
    expect(morning.total).toBe(1);
    expect(morning.results[0].coverage.status).toBe('covered');
    expect(morning.results[0].access.requirements[0].openAtStart).toBe(true);
    expect(morning.results[0].open24Hours.status).toBe('unknown');
    const timeline = calendarTimeline(record.content.schedule.building, '2026-10-10');
    expect(intervalAt(timeline.unknown, parsePerthTime('2026-10-10T01:00'))).toBeUndefined();
    expect(intervalAt(timeline.unknown, parsePerthTime('2026-10-10T06:00'))).toBeDefined();
    expect(evaluateLibrary(record, request('start=2026-10-10T06:00')).opening.status).toBe('unknown');
    expect(searchLibraries([record], request('start=2026-10-10T06:00')).total).toBe(0);
    expect(evaluateLibrary(record, request('start=2026-10-09T22:00&end=2026-10-10T07:00')).coverage.status).toBe('unknown');
  });

  it.each(['closed', 'unknown', 'hours'] as const)('still honours an explicit receiving-day %s override', (status) => {
    const record = library();
    for (const calendar of [record.content.schedule.building, ...record.content.schedule.access]) calendar.overrides.push({
      id: 'saturday', kind: 'date', startDate: '2026-10-10', endDate: '2026-10-10', status,
      intervals: status === 'hours' ? [{ weekday: 6, startMinute: 540, endMinute: 1020 }] : [], sourceId: status === 'unknown' ? null : 'source',
    });
    expect(evaluateLibrary(record, request('start=2026-10-09T22:00')).opening.window?.until).toBe('2026-10-10T00:00:00+08:00');
    expect(searchLibraries([record], request('start=2026-10-10T01:00')).total).toBe(0);
    if (status === 'hours') expect(searchLibraries([record], request('start=2026-10-10T09:00')).total).toBe(1);
  });

  it('keeps building opening and unknown entry permission separate', () => {
    const record = library();
    record.content.schedule.access[0].overrides = [];
    const result = evaluateLibrary(record, request('start=2026-10-10T01:00&end=2026-10-10T05:00'));
    expect(result.opening.status).toBe('open');
    expect(result.access.status).toBe('unknown');
    expect(result.coverage.status).toBe('unknown');
  });

  it('does not infer building opening from an entry exception alone', () => {
    const record = library();
    record.content.schedule.building.overrides = [];
    expect(searchLibraries([record], request('start=2026-10-10T01:00')).total).toBe(0);
  });

  it('retains the existing known-baseline behaviour', () => {
    const record = library();
    for (const calendar of [record.content.schedule.building, ...record.content.schedule.access]) { calendar.status = 'known'; calendar.sourceId = 'source'; }
    expect(evaluateLibrary(record, request('start=2026-10-10T01:00')).opening.window)
      .toMatchObject({ until: '2026-10-10T06:00:00+08:00', endReason: 'closes' });
  });
});
