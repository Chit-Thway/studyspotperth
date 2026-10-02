import { describe, expect, it } from 'vitest';
import { libraryFixtures } from '../../tests/fixtures/libraries';
import type { LibraryRecord } from './library';
import { evaluateLibrary, searchLibraries, approximateDistanceKm } from './library-search';
import { parseSearchRequest } from './search-request';
import { parsePerthTime } from './perth-time';

const clock = parsePerthTime('2026-10-02T14:00');
const origin = { id: 'fixture-cbd', name: 'Fictional origin', latitude: -31.95, longitude: 115.86 };
const records: LibraryRecord[] = libraryFixtures.map((fixture, index) => ({ ...structuredClone(fixture),
  revisionId: `${fixture.id}-published`, status: 'published', isFixture: true,
  content: { ...structuredClone(fixture.content), longitude: fixture.content.longitude === null ? null : 115.86 + index * 0.01 } }));
const request = (query = '') => parseSearchRequest(new URLSearchParams(query), clock, origin);
const fixture = (id: string) => structuredClone(records.find((record) => record.id === `fixture-${id}`)!);
const search = (query = '', data = records) => searchLibraries(data, request(query));
const ids = (query = '', data = records) => search(query, data).results.map((result) => result.library.id);
const week = (startMinute: number, endMinute: number) => Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute, endMinute }));

describe('search, access and ranking', () => {
  it('ranks declared UWA 24/7 options first without hiding other open institutions', () => {
    const result = search('cards=uwa');
    expect(result.results.slice(0, 2).map((item) => item.library.id)).toEqual(['fixture-uwa', 'fixture-semester']);
    expect(ids('cards=uwa')).toContain('fixture-curtin');
    expect(ids('cards=uwa')).toContain('fixture-public');
    expect(result.results.find((item) => item.library.id === 'fixture-curtin')?.access).toMatchObject({ status: 'unmatched', window: null });
  });
  it('24/7 alone includes every qualifying institution, then explicit UWA narrows it', () => {
    expect(ids('cards=uwa&open24Hours=true')).toEqual(['fixture-uwa', 'fixture-semester', 'fixture-curtin']);
    expect(ids('cards=uwa&open24Hours=true&institutions=uwa')).toEqual(['fixture-uwa', 'fixture-semester']);
    expect(ids('open24Hours=true')).toEqual(['fixture-uwa', 'fixture-curtin', 'fixture-semester']);
  });
  it('multiple cards share priority, sorted by distance inside that group', () => {
    expect(ids('cards=uwa,curtin').slice(0, 3)).toEqual(['fixture-uwa', 'fixture-curtin', 'fixture-semester']);
  });
  it('ORs explicit institutions and ANDs different filter categories', () => {
    expect(ids('institutions=uwa,curtin&open24Hours=true&quietStudy=true')).toEqual(['fixture-uwa', 'fixture-curtin', 'fixture-semester']);
    expect(ids('institutions=uwa,curtin&groupStudy=true')).toEqual([]);
    expect(ids('institutions=uwa,public&open24Hours=true')).not.toContain('fixture-curtin');
  });
  it('institution selection does not create a matching card or Wi-Fi entitlement', () => {
    const result = search('institutions=uwa').results.find((item) => item.library.id === 'fixture-uwa')!;
    expect(result.rankingGroup).toBe('other');
    expect(result.access.requirements.find((entry) => entry.group === 'uwa')?.match).toBe('not-in-profile');
    expect(result.access.window?.until).toBe('2026-10-02T17:00:00+08:00');
    expect(ids('institutions=uwa&usableWifi=true')).toEqual([]);
  });
  it('keeps a nearer shortfall ahead of a farther fully covered session', () => {
    const result = search('end=2026-10-02T18:00', [fixture('public'), fixture('late')]);
    expect(result.results.map((item) => item.library.id)).toEqual(['fixture-public', 'fixture-late']);
    expect(result.results[0].coverage).toEqual({ status: 'shortfall', shortfallMinutes: 60 });
    expect(result.results[1].coverage.status).toBe('covered');
  });
  it('uses end coverage only to break an exact known distance tie', () => {
    const near = fixture('public');
    const late = fixture('late');
    late.content.longitude = near.content.longitude;
    expect(ids('end=2026-10-02T18:00', [near, late])).toEqual(['fixture-late', 'fixture-public']);
    expect(ids('', [near, late])).toEqual(['fixture-late', 'fixture-public']); // Stable slug order without a requested end.
  });
  it('requires opening at start, including the exact opening and closing boundaries', () => {
    expect(ids('start=2026-10-02T08:59', [fixture('public')])).toEqual([]);
    expect(ids('start=2026-10-02T09:00', [fixture('public')])).toEqual(['fixture-public']);
    expect(ids('start=2026-10-02T17:00', [fixture('public')])).toEqual([]);
  });
  it('stops public entry before building closure, while matching cards bridge it', () => {
    const uwa = fixture('uwa');
    expect(evaluateLibrary(uwa, request('end=2026-10-02T18:00'))).toMatchObject({
      opening: { status: 'open', window: { endReason: 'verification-limit' } },
      access: { status: 'matches-rules', window: { until: '2026-10-02T17:00:00+08:00' } },
      coverage: { status: 'shortfall', shortfallMinutes: 60 },
    });
    expect(evaluateLibrary(uwa, request('cards=uwa&end=2026-10-03T06:00')).coverage.status).toBe('covered');
    expect(evaluateLibrary(uwa, request('start=2026-10-02T18:00')).access.status).toBe('unmatched');
  });
  it('excludes unknown hours, preserves unknown access, and never claims its personal window', () => {
    expect(ids()).not.toContain('fixture-unknown');
    const unknown = search().results.find((item) => item.library.id === 'fixture-unknown-entry')!;
    expect(unknown.access).toMatchObject({ status: 'unknown', window: null });
    expect(unknown.access.requirements[0]).toMatchObject({ match: 'unknown', window: null, openAtStart: null });
    expect(evaluateLibrary(fixture('unknown'), request()).opening.status).toBe('unknown');
  });
  it('supports overnight hours over the Sunday/Monday boundary and stops at 06:00', () => {
    const overnight = fixture('overnight');
    const result = evaluateLibrary(overnight, request('start=2026-10-05T01:00&end=2026-10-05T07:00'));
    expect(result.access.window?.until).toBe('2026-10-05T06:00:00+08:00');
    expect(result.coverage).toEqual({ status: 'shortfall', shortfallMinutes: 60 });
    expect(ids('start=2026-10-05T06:00', [overnight])).toEqual([]);
    expect(result.open24Hours.status).toBe('does-not-qualify');
  });
  it.each(['date', 'period'] as const)('keeps searches and session coverage through the end of an overnight %s exception', (kind) => {
    const library = fixture('overnight');
    for (const schedule of [library.content.schedule.building, library.content.schedule.access[0]]) {
      schedule.overrides = [{ id: 'friday-hours', kind, startDate: kind === 'date' ? '2026-10-02' : '2026-10-01', endDate: '2026-10-02', status: 'hours',
        intervals: [{ weekday: 5, startMinute: 1200, endMinute: 1800 }], sourceId: 'fictional-source' }];
    }
    const saturday = search('start=2026-10-03T01:00&end=2026-10-03T05:00', [library]);
    expect(saturday.total).toBe(1);
    expect(saturday.results[0].access.window?.until).toBe('2026-10-03T06:00:00+08:00');
    expect(saturday.results[0].coverage).toEqual({ status: 'covered', shortfallMinutes: null });
    expect(evaluateLibrary(library, request('start=2026-10-02T22:00&end=2026-10-03T05:00')).coverage)
      .toEqual({ status: 'covered', shortfallMinutes: null });
    expect(ids('start=2026-10-03T06:00', [library])).toEqual([]);
  });
  it('applies semester hours, closure dates, and the end of a period', () => {
    const semester = fixture('semester');
    expect(evaluateLibrary(semester, request()).open24Hours.status).toBe('qualifies');
    expect(evaluateLibrary(semester, request('cards=uwa')).access.window?.until).toBe('2026-10-15T00:00:00+08:00');
    expect(ids('start=2026-10-15T14:00', [semester])).toEqual([]);
    expect(ids('start=2026-10-14T14:00&open24Hours=true', [semester])).toEqual([]);
    expect(ids('start=2026-10-30T14:00&open24Hours=true', [semester])).toEqual([]);
    expect(evaluateLibrary(semester, request('start=2026-11-01T14:00')).open24Hours.status).toBe('does-not-qualify');
  });
  it('a single full-day opening does not establish 24/7', () => {
    const library = fixture('public');
    library.content.schedule.building.recurring = [{ weekday: 5, startMinute: 0, endMinute: 1440 }];
    library.content.schedule.access[0].recurring = structuredClone(library.content.schedule.building.recurring);
    expect(evaluateLibrary(library, request()).open24Hours.status).toBe('does-not-qualify');
  });
  it('recognises public 24/7 access without a declared card', () => {
    const library = fixture('public');
    library.content.schedule.building.recurring = week(0, 1440);
    library.content.schedule.access[0].recurring = week(0, 1440);
    const result = evaluateLibrary(library, request('open24Hours=true'));
    expect(result.open24Hours.groups).toMatchObject([{ group: 'public', match: 'public', verifiedUntil: '2026-10-09T00:00:00+08:00' }]);
    expect(ids('open24Hours=true', [library])).toEqual(['fixture-public']);
    expect(result.rankingGroup).toBe('other');
  });
  it('a known building closure remains a shortfall even if entry hours later become unknown', () => {
    const library = fixture('public');
    library.content.schedule.access[0].overrides = [{ id: 'unknown-tomorrow', kind: 'date', startDate: '2026-10-03', endDate: '2026-10-03', status: 'unknown', intervals: [], sourceId: null }];
    const result = evaluateLibrary(library, request('end=2026-10-03T06:00'));
    expect(result.access.window?.endReason).toBe('closes');
    expect(result.coverage).toEqual({ status: 'shortfall', shortfallMinutes: 780 });
  });
  it('does not attach a redundant card requirement to public university 24/7 entry', () => {
    const library = fixture('uwa');
    library.content.schedule.access[0].recurring = week(0, 1440);
    const result = evaluateLibrary(library, request('cards=uwa'));
    expect(result.open24Hours.groups.map((group) => group.group)).toEqual(['public']);
    expect(result.rankingGroup).toBe('matching-university-24-hours');
  });
  it('keeps absent entry data and future entry uncertainty explicit', () => {
    const library = fixture('uwa');
    library.content.schedule.access = [];
    expect(evaluateLibrary(library, request())).toMatchObject({ access: { status: 'unknown', window: null }, open24Hours: { status: 'unknown' } });
    const uncertain = fixture('uwa');
    uncertain.content.schedule.access[1].overrides = [{ id: 'unknown-tomorrow', kind: 'date', startDate: '2026-10-03', endDate: '2026-10-03', status: 'unknown', intervals: [], sourceId: null }];
    const result = evaluateLibrary(uncertain, request('cards=uwa&end=2026-10-03T06:00'));
    expect(result.access.window).toMatchObject({ until: '2026-10-03T00:00:00+08:00', endReason: 'unknown' });
    expect(result.coverage).toEqual({ status: 'unknown', shortfallMinutes: null });
    expect(result.open24Hours.status).toBe('unknown');
  });
  it('intersects building and entry hours instead of trusting a longer card schedule', () => {
    const library = fixture('uwa');
    library.content.schedule.building.recurring = week(540, 1020);
    const result = evaluateLibrary(library, request('cards=uwa'));
    expect(result.open24Hours.status).toBe('does-not-qualify');
    expect(result.access.window?.until).toBe('2026-10-02T17:00:00+08:00');
  });
  it('public hours bridge restricted hours for a stated eligible 24/7 group', () => {
    const library = fixture('uwa');
    library.content.schedule.access[1].recurring = [...week(0, 540), ...week(1020, 1440)];
    const result = evaluateLibrary(library, request('cards=uwa'));
    expect(result.open24Hours.groups.map((group) => group.group)).toEqual(['uwa']);
    expect(result.access.window?.endReason).toBe('verification-limit');
    expect(evaluateLibrary(library, request()).access.window?.until).toBe('2026-10-02T17:00:00+08:00');
  });
  it('does not combine unrelated university schedules into a fictitious eligible group', () => {
    const library = fixture('uwa');
    library.content.schedule.access = [
      { ...library.content.schedule.access[1], recurring: week(0, 720) },
      { ...library.content.schedule.access[1], group: 'curtin', requirement: 'Curtin card', recurring: week(720, 1440) },
    ];
    expect(evaluateLibrary(library, request('cards=uwa,curtin')).open24Hours.status).toBe('does-not-qualify');
    expect(evaluateLibrary(library, request('cards=uwa,curtin')).access.window?.endReason).toBe('verification-limit');
  });
  it('leaves Wi-Fi off by default and evaluates card eligibility separately from entry', () => {
    expect(ids('cards=uwa')).toContain('fixture-curtin');
    expect(ids('cards=uwa&usableWifi=true')).not.toContain('fixture-curtin');
    expect(ids('cards=curtin&institutions=uwa&usableWifi=true')).toContain('fixture-uwa');
    const result = evaluateLibrary(fixture('uwa'), request('cards=curtin&start=2026-10-02T18:00'));
    expect(result.wifi).toMatchObject({ status: 'eligible' });
    expect(result.wifi.networks.find((network) => network.kind === 'eduroam')).toMatchObject({ match: 'matches-profile', needsActiveCredentials: true });
    expect(result.access.status).toBe('unmatched');
  });
  it('labels guest and unknown Wi-Fi without assuming credentials', () => {
    const library = fixture('late');
    library.content.wifi.networks = library.content.wifi.networks.filter((network) => network.kind === 'restricted-guest');
    expect(evaluateLibrary(library, request()).wifi).toMatchObject({ status: 'unmatched', networks: [{ match: 'additional-requirements' }] });
    expect(ids('usableWifi=true', [library, fixture('unknown-entry')])).toEqual([]);
  });
  it('excludes draft and archived records, paginates after ranking, and explains emptiness', () => {
    const draft = fixture('uwa');
    draft.status = 'draft';
    expect(ids('cards=uwa', [draft])).toEqual([]);
    const result = search('cards=uwa&limit=1&offset=1');
    expect(result.results[0].library.id).toBe('fixture-semester');
    expect(result.total).toBe(6);
    expect(result.nextOffset).toBe(2);
    expect(search('groupStudy=true').emptyReason).toContain('selected filters');
    expect(search('offset=100').emptyReason).toContain('no more results');
  });
  it('keeps missing distance last and does not mutate input records or requests', () => {
    const missing = fixture('public');
    missing.content.latitude = missing.content.longitude = null;
    const original = structuredClone(records);
    const query = request('cards=uwa');
    const before = structuredClone(query);
    searchLibraries(records, query);
    expect(records).toEqual(original);
    expect(query).toEqual(before);
    expect(ids('', [missing, fixture('late')])).toEqual(['fixture-late', 'fixture-public']);
    expect(approximateDistanceKm(origin, origin)).toBe(0);
    expect(approximateDistanceKm(origin, { latitude: 0, longitude: 0 })).toBeGreaterThan(10000);
  });
});
