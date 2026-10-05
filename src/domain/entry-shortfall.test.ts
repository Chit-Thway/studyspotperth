import { describe, expect, it } from 'vitest';
import { emptyLibraryContent, parseAdminContent, validateAdminPublication } from './admin';
import { evaluateLibrary } from './library-search';
import type { LibraryRecord } from './library';
import { parseSearchRequest } from './search-request';
import { parsePerthTime } from './perth-time';

function record(): LibraryRecord {
  const content = emptyLibraryContent();
  content.name = 'Synthetic definite entry closure'; content.address = 'Synthetic test address';
  content.sources = [{ id: 'source', kind: 'official', label: 'Synthetic source', url: 'https://example.invalid/hours', checkedOn: '2026-10-05' }];
  content.schedule.building.overrides = [{ id: 'monday', kind: 'date', startDate: '2026-10-05', endDate: '2026-10-05',
    status: 'hours', intervals: [{ weekday: 1, startMinute: 0, endMinute: 1440 }], sourceId: 'source' }];
  content.schedule.access = [{ status: 'known', recurring: [{ weekday: 1, startMinute: 0, endMinute: 1440 }],
    overrides: [], sourceId: 'source', group: 'public', requirement: 'Public entry', needsActiveCredentials: false }];
  const canonical = parseAdminContent(content); validateAdminPublication(canonical);
  return { id: 'synthetic', slug: 'synthetic-entry-closure', institution: 'public', status: 'published', isFixture: false, revisionId: 'revision', content: canonical };
}
function evaluate(library = record(), cards = '') {
  return evaluateLibrary(library, parseSearchRequest(new URLSearchParams(`start=2026-10-05T23:00&end=2026-10-06T01:00&cards=${cards}`), parsePerthTime('2026-10-05T14:00')));
}
describe('definite entry restrictions at unknown building boundaries', () => {
  it('reports a 60-minute shortfall when the only eligible entry closes at midnight', () => {
    const result = evaluate();
    expect(result.opening.window?.endReason).toBe('unknown');
    expect(result.access.window).toMatchObject({ until: '2026-10-06T00:00:00+08:00', endReason: 'closes' });
    expect(result.access.requirements[0].window?.endReason).toBe('closes');
    expect(result.coverage).toEqual({ status: 'shortfall', shortfallMinutes: 60 });
  });
  it('still reports a shortfall with confirmed building hours', () => {
    const library = record(); library.content.schedule.building = { status: 'known', sourceId: 'source',
      recurring: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })), overrides: [] };
    expect(evaluate(library).coverage).toEqual({ status: 'shortfall', shortfallMinutes: 60 });
  });
  it('keeps coverage unknown when eligible entry is also unknown after midnight', () => {
    const library = record();
    library.content.schedule.access[0] = { ...library.content.schedule.access[0], ...structuredClone(library.content.schedule.building) };
    expect(evaluate(library).coverage.status).toBe('unknown');
  });
  it('keeps building uncertainty where entry is confirmed to continue', () => {
    const library = record(); library.content.schedule.access[0].recurring.push({ weekday: 2, startMinute: 0, endMinute: 1440 });
    expect(evaluate(library).coverage.status).toBe('unknown');
  });
  it('does not let an unheld card conceal a definite public-entry closure', () => {
    const library = record(); library.content.schedule.access.push({ status: 'unknown', sourceId: null, recurring: [], overrides: [],
      group: 'uwa', requirement: 'UWA card', needsActiveCredentials: false });
    expect(evaluate(library).coverage.status).toBe('shortfall');
    expect(evaluate(library, 'uwa').coverage.status).toBe('unknown');
  });
  it('does not claim a closure when another unknown entry group could allow access', () => {
    const library = record(); library.content.schedule.access.push({ status: 'unknown', sourceId: null, recurring: [], overrides: [],
      group: 'unknown', requirement: 'Unconfirmed entry', needsActiveCredentials: false });
    expect(evaluate(library).coverage.status).toBe('unknown');
  });
});
