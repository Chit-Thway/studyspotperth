import { describe, expect, it } from 'vitest';
import { libraryFixtures } from '../../../tests/fixtures/libraries';
import { evaluateLibrary } from '../../domain/library-search';
import { parseSearchRequest } from '../../domain/search-request';
import { parsePerthTime } from '../../domain/perth-time';
import { availabilityLabel, coverageLabel, intervalLabel, directionsUrl } from './presentation';

const clock = parsePerthTime('2026-10-02T18:00');
function result(id: string, query = '') {
  const fixture = libraryFixtures.find((item) => item.id === `fixture-${id}`)!;
  return evaluateLibrary({ ...fixture, status: 'published', isFixture: true, revisionId: 'test-revision' }, parseSearchRequest(new URLSearchParams(query), clock));
}
describe('library explanations in the interface', () => {
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
  it('labels unknown and closed hours instead of availability', () => {
    expect(availabilityLabel(result('unknown'))).toBe('Opening hours unknown');
    expect(availabilityLabel(result('public'))).toBe('Closed at the selected start');
  });
  it('makes overnight minutes explicit and directions use destination coordinates', () => {
    expect(intervalLabel({ startMinute: 1200, endMinute: 1800 })).toBe('20:00–06:00 next day');
    expect(new URL(directionsUrl(result('uwa'))).searchParams.get('destination')).toBe('-31.95,115.86');
  });
});
