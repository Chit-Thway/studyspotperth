import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createSearchParams, type SetURLSearchParams } from 'react-router-dom';
import type { Coordinates } from '../../domain/location';
import { locationOrigin } from '../../domain/location';
import { useLocationPagination } from './use-location-pagination';
import { launchLibraries } from '../../../server/data/launch-libraries';
import { parseSearchRequest } from '../../domain/search-request';
import { searchLibraries } from '../../domain/library-search';

// Deterministic hook contract harness: state persists across renders, effects
// run after the request query is inspected. No DOM or permission prompt is claimed.
const hooks = vi.hoisted(() => ({ initialized: false, origin: null as string | null, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState: (initial: string | null) => {
    if (!hooks.initialized) { hooks.origin = initial; hooks.initialized = true; }
    return [hooks.origin, (value: string | null) => { hooks.origin = value; }];
  },
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
}));

const bentley = { latitude: -32.005, longitude: 115.894 };
const crawley = { latitude: -31.979, longitude: 115.818 };
const selected = 'start=2026-10-06T14:00&end=2026-10-06T18:00&cards=&institutions=uwa,curtin&open24Hours=true&usableWifi=true&quietStudy=true&groupStudy=true&wheelchairAccess=true&limit=2&offset=4';

function finder(query = selected) {
  let raw = new URLSearchParams(query);
  const navigate = vi.fn<SetURLSearchParams>((next) => { raw = createSearchParams(typeof next === 'function' ? next(raw) : next); });
  return {
    navigate,
    raw: () => raw,
    render: (coordinates: Coordinates | null) => useLocationPagination(raw, navigate, coordinates),
    commit: () => { hooks.effects.splice(0).forEach((effect) => effect()); },
  };
}
beforeEach(() => { hooks.initialized = false; hooks.origin = null; hooks.effects = []; });

describe('pagination when the effective device location changes', () => {
  it.each([
    ['enable', null, bentley], ['update', bentley, crawley], ['turn off', bentley, null],
    ['automatic restore', null, crawley], ['permission revocation', crawley, null],
  ] as const)('%s starts the new order on its first page and preserves selections', (_action, previous, next) => {
    const page = finder();
    expect(page.render(previous).get('offset')).toBe('4'); page.commit();
    const request = page.render(next);
    expect(request.has('offset')).toBe(false); // Before effects: never request an old page for the new origin.
    expect(page.raw().get('offset')).toBe('4');
    expect(request.toString()).toBe(new URLSearchParams(selected.replace('&offset=4', '')).toString());
    page.commit();
    expect(page.raw().has('offset')).toBe(false);
    expect(page.navigate).toHaveBeenCalledWith(expect.any(Function), { replace: true });
    expect(page.render(next).has('offset')).toBe(false); page.commit();
    expect(page.render(next).has('offset')).toBe(false); page.commit();
    page.navigate('start=2026-10-06T14:00&limit=2&offset=2');
    expect(page.render(next).get('offset')).toBe('2'); page.commit();
    expect(page.raw().get('offset')).toBe('2'); // Normal Next remains usable after reset.
  });
  it('preserves paging for unchanged coordinates, failed initial lookups and ordinary rerenders', () => {
    const page = finder();
    page.render(null); page.commit();
    expect(page.render(null).get('offset')).toBe('4'); page.commit();
    expect(page.navigate).not.toHaveBeenCalled();
    const pointPage = finder(); hooks.initialized = false;
    pointPage.render(bentley); pointPage.commit();
    expect(pointPage.render({ ...bentley }).get('offset')).toBe('4'); pointPage.commit();
    expect(pointPage.navigate).not.toHaveBeenCalled();
  });
  it('settles an origin change on the first page without replacing an already clean URL', () => {
    const page = finder('cards=uwa&limit=2'); page.render(null); page.commit();
    expect(page.render(bentley).toString()).toBe('cards=uwa&limit=2'); page.commit();
    expect(page.render(bentley).toString()).toBe('cards=uwa&limit=2'); page.commit();
    expect(page.navigate).not.toHaveBeenCalled();
  });
  it('returns the closest public-catalogue result instead of skipping it after enable, update and clear', () => {
    const page = finder('start=2026-10-06T14:00&limit=2&offset=4');
    const records = launchLibraries.map((record) => ({ ...record, isFixture: false, revisionId: 'test', status: 'published' as const }));
    const clock = Date.parse('2026-10-06T06:00:00Z');
    page.render(null); page.commit();
    for (const [point, closest] of [[bentley, 'tl-robertson-library'], [crawley, 'reid-library'], [null, 'city-of-perth-library']] as const) {
      const params = page.render(point);
      const origin = point ? locationOrigin(`${point.latitude},${point.longitude}`)! : undefined;
      const results = searchLibraries(records, parseSearchRequest(params, clock, origin));
      expect(results.offset).toBe(0);
      expect(results.results[0].library.slug).toBe(closest);
      page.commit(); page.render(point); page.commit(); page.render(point); page.commit();
      page.navigate('start=2026-10-06T14:00&limit=2&offset=4');
    }
  });
});
