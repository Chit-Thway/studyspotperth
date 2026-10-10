import { afterEach, expect, it, vi } from 'vitest';
import { launchLibraries } from './launch-libraries';

afterEach(() => vi.restoreAllMocks());
it.each([
  ['', 13], ['open24Hours=true', 6], ['usableWifi=true', 4], ['open24Hours=true&usableWifi=true', 2],
  ['cards=uwa&open24Hours=true&institutions=uwa', 2],
])('bounds timezone work on a cold catalogue search: %s', async (query, expectedTotal) => {
  // Fresh modules prevent a warm isolate cache from hiding excessive cold work.
  vi.resetModules();
  const { parseSearchRequest } = await import('../../src/domain/search-request');
  const { searchLibraries } = await import('../../src/domain/library-search');
  const records = launchLibraries.map((item) => ({ ...item, status: 'published' as const, isFixture: false, revisionId: 'resource-test' }));
  const calls = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
  const dateParses = vi.spyOn(Date, 'parse');
  const params = new URLSearchParams(query); params.set('start', '2026-10-09T14:00');
  const result = searchLibraries(records, parseSearchRequest(params, Date.parse('2026-10-09T06:00:00Z')));
  expect(result.total).toBe(expectedTotal);
  expect(calls.mock.calls.length).toBeLessThanOrEqual(128);
  expect(dateParses.mock.calls.length).toBeLessThanOrEqual(256);
});
