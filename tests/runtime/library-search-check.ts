import assert from 'node:assert/strict';
import { createLibraryRepository } from '../../server/libraries/repository';
import { handleLibraryRequest } from '../../server/libraries/http';
import { evaluateLibrary, searchLibraries } from '../../src/domain/library-search';
import { parseSearchRequest } from '../../src/domain/search-request';
import { parsePerthTime } from '../../src/domain/perth-time';
import { libraryFixtures } from '../../tests/fixtures/libraries';
import { locationOrigin, LOCATION_HEADER } from '../../src/domain/location';

/** Installed only in the isolated verification server, never in app Functions. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const repository = createLibraryRepository(env);
  const clock = parsePerthTime('2026-10-02T14:00');
  const records = await repository.listPublished({ includeFixtures: true });
  const origin = (await repository.listSuburbs({ includeFixtures: true }))[0];
  assert(origin);
  const options = { includeFixtures: true };
  const point = '-32.01,115.89';
  const locatedRequest = new Request('https://example.invalid/api/libraries?cards=uwa&open24Hours=true', { headers: { [LOCATION_HEADER]: point } });
  const located = await handleLibraryRequest(locatedRequest, env, 'search', undefined, clock, options);
  assert.equal(located.status, 200);
  const expectedLocationRequest = parseSearchRequest(new URLSearchParams('cards=uwa&open24Hours=true'), clock, locationOrigin(point)!);
  assert.deepEqual(await located.json(), JSON.parse(JSON.stringify({ ...searchLibraries(records, expectedLocationRequest), request: expectedLocationRequest, timeZone: 'Australia/Perth' })));
  const locatedDetail = await handleLibraryRequest(new Request(`https://example.invalid/api/libraries/${records[0].slug}?cards=uwa&open24Hours=true`, { headers: { [LOCATION_HEADER]: point } }), env, 'detail', records[0].slug, clock, options);
  assert.equal(locatedDetail.status, 200);
  assert.deepEqual(await locatedDetail.json(), JSON.parse(JSON.stringify({ result: evaluateLibrary(records[0], expectedLocationRequest), request: expectedLocationRequest, timeZone: 'Australia/Perth' })));
  for (const value of ['', '91,0', '-31.9,115.8,0', 'NaN,0']) {
    assert.equal((await handleLibraryRequest(new Request('https://example.invalid/api/libraries', { headers: { [LOCATION_HEADER]: value } }), env, 'search', undefined, clock)).status, 400);
  }
  const json = async (response: Response): Promise<unknown> => response.json();
  const canonicalJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
  const request = (query = '', method = 'GET') => new Request(`https://example.invalid/api/libraries?${query}`, { method });
  const matrix = [
    '', 'cards=uwa', 'cards=uwa&open24Hours=true', 'cards=uwa&open24Hours=true&institutions=uwa',
    'open24Hours=true', 'cards=uwa,curtin', 'institutions=uwa,curtin&open24Hours=true', 'institutions=uwa',
    'end=2026-10-02T18:00', 'start=2026-10-02T17:00', 'start=2026-10-05T01:00',
    'start=2026-10-15T14:00', 'start=2026-10-14T14:00&open24Hours=true',
    'usableWifi=true&cards=uwa', 'usableWifi=true&institutions=uwa', 'groupStudy=true', 'limit=2&offset=2',
  ];
  for (const query of matrix) {
    const params = new URLSearchParams(query);
    params.set('suburb', origin.id);
    const parsed = parseSearchRequest(params, clock, origin);
    const response = await handleLibraryRequest(request(params.toString()), env, 'search', undefined, clock, options);
    assert.equal(response.status, 200, `Search failed: ${query}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await json(response), canonicalJson({ ...searchLibraries(records, parsed), request: parsed, timeZone: 'Australia/Perth' }), `Domain/API mismatch: ${query}`);
  }
  // Supported historical form inputs must resolve to the real Perth offset in workerd too.
  const historical = await handleLibraryRequest(request('start=2007-01-01T12:00'), env, 'search', undefined, clock, options);
  assert.equal(historical.status, 200);
  const historicalBody = await historical.json<{ request: { start: number }; results: { evaluatedAt: string }[] }>();
  assert.equal(historicalBody.request.start, Date.parse('2007-01-01T03:00:00Z'));
  assert(historicalBody.results.length > 0);
  assert(historicalBody.results.every((result) => result.evaluatedAt === '2007-01-01T12:00:00+09:00'));
  assert.equal((await handleLibraryRequest(request('start=2006-12-03T02:30'), env, 'search', undefined, clock, options)).status, 400);
  assert.equal((await handleLibraryRequest(request('after=beasley-law-library'), env, 'search', undefined, clock, options)).status, 400);
  const params = new URLSearchParams(`cards=uwa&suburb=${origin.id}&start=2026-10-15T14:00`);
  const semester = records.find((record) => record.id === 'fixture-semester')!;
  const detail = await handleLibraryRequest(request(params.toString()), env, 'detail', semester.slug, clock, options);
  assert.equal(detail.status, 200);
  assert.deepEqual(await json(detail), canonicalJson({ result: evaluateLibrary(semester, parseSearchRequest(params, clock, origin)),
    request: parseSearchRequest(params, clock, origin), timeZone: 'Australia/Perth' }));
  assert.equal((await handleLibraryRequest(request(), env, 'detail', 'fictional-missing', clock, options)).status, 404);
  assert.equal((await handleLibraryRequest(request(), env, 'detail', records[0].slug, clock)).status, 404);
  const publicSearch = await handleLibraryRequest(request('start=2026-10-02T14:00'), env, 'search', undefined, clock);
  assert.deepEqual(await json(publicSearch), canonicalJson({ ...searchLibraries([], parseSearchRequest(new URLSearchParams('start=2026-10-02T14:00'), clock)),
    request: parseSearchRequest(new URLSearchParams('start=2026-10-02T14:00'), clock), timeZone: 'Australia/Perth' }));
  for (const query of ['start=2026-02-30T14:00', 'end=2026-10-02T13:00', 'cards=public', 'open24Hours=1', 'includeFixtures=true', 'suburb=missing']) {
    assert.equal((await handleLibraryRequest(request(query), env, 'search', undefined, clock)).status, 400, query);
  }
  assert.equal((await handleLibraryRequest(request(), env, 'detail', '../private', clock)).status, 400);
  const wrongMethod = await handleLibraryRequest(request('', 'POST'), env, 'search', undefined, clock);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET');
  assert.equal((await handleLibraryRequest(request('cards=uwa'), env, 'suburbs', undefined, clock)).status, 400);
  assert.deepEqual(await json(await handleLibraryRequest(request(), env, 'suburbs', undefined, clock)), {
    origins: [{ id: 'perth-cbd', name: 'Perth CBD', latitude: -31.9523, longitude: 115.8613 }], defaultOriginId: 'perth-cbd',
  });

  // Synthetic non-fixture rows exist only in this disposable database to exercise
  // the real public boundary, without adding launch data or a fixture query flag.
  const content = structuredClone(libraryFixtures[0].content);
  content.name = 'Synthetic runtime verification record';
  content.suburbId = null;
  content.sources = [{ id: 'fictional-source', kind: 'confirmation', label: 'Synthetic disposable runtime verification data', url: null, checkedOn: '2026-10-02' }];
  const created = await repository.createLibrary({ slug: 'runtime-public-boundary', institution: 'public' }, content);
  assert.equal((await handleLibraryRequest(request(), env, 'detail', 'runtime-public-boundary', clock)).status, 404);
  await repository.publishDraft(created.revisionId);
  const published = await repository.getPublishedBySlug('runtime-public-boundary');
  assert(published);
  const draftId = await repository.createDraft(created.libraryId, { ...content, name: 'Synthetic hidden draft edit' });
  const visible = await handleLibraryRequest(request(), env, 'detail', published.slug, clock);
  assert.deepEqual(await json(visible), canonicalJson({ result: evaluateLibrary(published, parseSearchRequest(new URLSearchParams(), clock)),
    request: parseSearchRequest(new URLSearchParams(), clock), timeZone: 'Australia/Perth' }));
  assert.equal((await repository.getLatestDraft(created.libraryId))?.revisionId, draftId);
  const searched = await handleLibraryRequest(request(), env, 'search', undefined, clock);
  assert.deepEqual(await json(searched), canonicalJson({ ...searchLibraries([published], parseSearchRequest(new URLSearchParams(), clock)),
    request: parseSearchRequest(new URLSearchParams(), clock), timeZone: 'Australia/Perth' }));
  await repository.unpublish(created.libraryId);
  assert.equal((await handleLibraryRequest(request(), env, 'detail', published.slug, clock)).status, 404);

  const overnight = structuredClone(libraryFixtures.find((fixture) => fixture.id === 'fixture-overnight')!.content);
  for (const schedule of [overnight.schedule.building, overnight.schedule.access[0]]) {
    schedule.overrides = [{ id: 'friday-hours', kind: 'date', startDate: '2026-10-02', endDate: '2026-10-02', status: 'hours',
      intervals: [{ weekday: 5, startMinute: 1200, endMinute: 1800 }], sourceId: 'fictional-source' }];
  }
  const overnightRecord = await repository.createLibrary({ slug: 'fictional-overnight-exception', institution: 'public', isFixture: true }, overnight);
  await repository.publishDraft(overnightRecord.revisionId);
  const overnightParams = new URLSearchParams(`start=2026-10-03T01:00&end=2026-10-03T05:00&suburb=${origin.id}`);
  const overnightRequest = parseSearchRequest(overnightParams, clock, origin);
  const overnightExpected = searchLibraries(await repository.listPublished(options), overnightRequest);
  const overnightResult = overnightExpected.results.find((result) => result.library.id === overnightRecord.libraryId);
  assert(overnightResult, 'A published overnight date exception must remain searchable after midnight.');
  assert.equal(overnightResult.opening.window?.until, '2026-10-03T06:00:00+08:00');
  assert.deepEqual(overnightResult.coverage, { status: 'covered', shortfallMinutes: null });
  const overnightResponse = await handleLibraryRequest(request(overnightParams.toString()), env, 'search', undefined, clock, options);
  assert.equal(overnightResponse.status, 200);
  assert.deepEqual(await json(overnightResponse), canonicalJson({ ...overnightExpected, request: overnightRequest, timeZone: 'Australia/Perth' }));
  const overnightDetail = await handleLibraryRequest(request(overnightParams.toString()), env, 'detail', 'fictional-overnight-exception', clock, options);
  assert.equal(overnightDetail.status, 200);
  assert.deepEqual(await json(overnightDetail), canonicalJson({ result: overnightResult, request: overnightRequest, timeZone: 'Australia/Perth' }));
  assert.equal((await handleLibraryRequest(request(), env, 'detail', 'fictional-overnight-exception', clock)).status, 404);
  await repository.unpublish(overnightRecord.libraryId);
  for (const kind of ['date', 'period'] as const) {
    const unknownBaseline = structuredClone(overnight);
    for (const schedule of [unknownBaseline.schedule.building, unknownBaseline.schedule.access[0]]) {
      schedule.status = 'unknown';
      schedule.sourceId = null;
      schedule.recurring = [];
      schedule.overrides[0].kind = kind;
      schedule.overrides[0].startDate = kind === 'date' ? '2026-10-02' : '2026-10-01';
    }
    const slug = `fictional-overnight-unknown-${kind}`;
    const createdUnknown = await repository.createLibrary({ slug, institution: 'public', isFixture: true }, unknownBaseline);
    await repository.publishDraft(createdUnknown.revisionId);
    const persisted = await repository.getPublishedBySlug(slug, options);
    assert(persisted);
    for (const start of ['2026-10-02T22:00', '2026-10-03T01:00', '2026-10-03T06:00']) {
      const query = new URLSearchParams({ start, end: '2026-10-03T07:00', suburb: origin.id });
      if (!start.endsWith('06:00')) query.set('end', '2026-10-03T05:00');
      const parsed = parseSearchRequest(query, clock, origin);
      const expected = evaluateLibrary(persisted, parsed);
      if (start.endsWith('06:00')) assert.equal(expected.opening.status, 'unknown');
      else {
        assert.equal(expected.opening.window?.until, '2026-10-03T06:00:00+08:00');
        assert.equal(expected.opening.window.endReason, 'unknown');
        assert.equal(expected.access.window?.until, '2026-10-03T06:00:00+08:00');
        assert.equal(expected.coverage.status, 'covered');
      }
      const detailResponse = await handleLibraryRequest(request(query.toString()), env, 'detail', slug, clock, options);
      assert.equal(detailResponse.status, 200);
      assert.deepEqual(await json(detailResponse), canonicalJson({ result: expected, request: parsed, timeZone: 'Australia/Perth' }));
      const expectedSearch = searchLibraries(await repository.listPublished(options), parsed);
      assert.equal(expectedSearch.results.some((result) => result.library.id === createdUnknown.libraryId), !start.endsWith('06:00'));
      const searchResponse = await handleLibraryRequest(request(query.toString()), env, 'search', undefined, clock, options);
      assert.equal(searchResponse.status, 200);
      assert.deepEqual(await json(searchResponse), canonicalJson({ ...expectedSearch, request: parsed, timeZone: 'Australia/Perth' }));
    }
    assert.equal((await handleLibraryRequest(request(), env, 'detail', slug, clock)).status, 404);
    await repository.unpublish(createdUnknown.libraryId);
  }
  const entryClosure = structuredClone(overnight);
  entryClosure.schedule.building = { status: 'unknown', sourceId: null, recurring: [], overrides: [
    { id: 'monday-only', kind: 'date', startDate: '2026-10-05', endDate: '2026-10-05', status: 'hours',
      intervals: [{ weekday: 1, startMinute: 0, endMinute: 1440 }], sourceId: 'fictional-source' },
  ] };
  entryClosure.schedule.access = [{ group: 'public', requirement: 'Public entry', needsActiveCredentials: false,
    status: 'known', sourceId: 'fictional-source', recurring: [{ weekday: 1, startMinute: 0, endMinute: 1440 }], overrides: [] }];
  const closureRecord = await repository.createLibrary({ slug: 'fictional-definite-entry-closure', institution: 'public', isFixture: true }, entryClosure);
  await repository.publishDraft(closureRecord.revisionId);
  const closureQuery = new URLSearchParams('start=2026-10-05T23:00&end=2026-10-06T01:00');
  const closureResponse = await handleLibraryRequest(request(closureQuery.toString()), env, 'detail', 'fictional-definite-entry-closure', clock, options);
  assert.equal(closureResponse.status, 200);
  const closureResult = (await closureResponse.json<{ result: ReturnType<typeof evaluateLibrary> }>()).result;
  assert.equal(closureResult.opening.window?.endReason, 'unknown');
  assert.equal(closureResult.access.window?.endReason, 'closes');
  assert.deepEqual(closureResult.coverage, { status: 'shortfall', shortfallMinutes: 60 });
  await repository.unpublish(closureRecord.libraryId);
  return Response.json({ status: 'ok', cases: matrix.length + 4, checks: ['search', 'detail', 'filters', 'ranking', 'validation', 'publication', 'fixture-exclusion', 'overnight-exceptions', 'unknown-baseline-overnight', 'definite-entry-shortfall'] });
};
