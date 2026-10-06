import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createSearchParams, type SetURLSearchParams } from 'react-router-dom';
import type { Coordinates } from '../../domain/location';
import { locationOrigin } from '../../domain/location';
import { useFinderPagination } from './use-finder-pagination';
import { launchLibraries } from '../../../server/data/launch-libraries';
import { parseSearchRequest } from '../../domain/search-request';
import { searchLibraries } from '../../domain/library-search';
import { profileFinderParams } from '../../domain/account';
import type { UniversityCard } from '../../domain/search-context';

// Deterministic hook contract harness: state persists across renders, effects
// run after the request query is inspected. No DOM or permission prompt is claimed.
const hooks = vi.hoisted(() => ({ lastKey: null as string | null, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
}));
vi.mock('./finder-pagination-context', () => ({
  useFinderPaginationMemory: () => ({ lastKey: hooks.lastKey, remember: (key: string) => { hooks.lastKey = key; } }),
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
    render: (coordinates: Coordinates | null, cards?: UniversityCard[], ready = true) => useFinderPagination(
      profileFinderParams(raw, cards ? { suburbId: null, cards } : undefined), navigate, coordinates, ready),
    commit: () => { hooks.effects.splice(0).forEach((effect) => effect()); },
  };
}
beforeEach(() => { hooks.lastKey = null; hooks.effects = []; });

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
    const pointPage = finder(); hooks.lastKey = null;
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
  it('resets after location changes while the finder is unmounted on a detail screen (#14)', () => {
    const query = 'start=2026-10-06T14:00&limit=2&offset=4';
    const page = finder(query); page.render(bentley); page.commit();
    // Only the finder unmounts; the application/location provider remains alive.
    const returned = finder(query);
    const params = returned.render(null);
    expect(params.has('offset')).toBe(false);
    const records = launchLibraries.map((record) => ({ ...record, isFixture: false, revisionId: 'test', status: 'published' as const }));
    expect(searchLibraries(records, parseSearchRequest(params, Date.parse('2026-10-06T06:00:00Z'))).results[0].library.slug)
      .toBe('city-of-perth-library');
    returned.commit(); expect(returned.raw().has('offset')).toBe(false);
  });
  it('resets after inherited cards change on Profile, retaining the study session (#15)', () => {
    const query = 'start=2026-10-06T14:00&end=2026-10-06T18:00&limit=2&offset=4';
    const page = finder(query); page.render(null, []); page.commit();
    const returned = finder(query);
    const params = returned.render(null, ['uwa']);
    expect(params.has('offset')).toBe(false);
    expect(params.get('cards')).toBe('uwa');
    expect(params.get('start')).toBe('2026-10-06T14:00');
    expect(params.get('end')).toBe('2026-10-06T18:00');
    const records = launchLibraries.map((record) => ({ ...record, isFixture: false, revisionId: 'test', status: 'published' as const }));
    expect(searchLibraries(records, parseSearchRequest(params, Date.parse('2026-10-06T06:00:00Z'))).results.map((result) => result.library.slug))
      .toEqual(['j-robin-warren-library', 'reid-library']);
    returned.commit(); expect(returned.raw().has('cards')).toBe(false);
  });
  it('resets when signing in changes the effective cards on the mounted finder (#15)', () => {
    const page = finder('start=2026-10-06T14:00&limit=2&offset=4'); page.render(null, []); page.commit();
    expect(page.render(null, ['uwa']).has('offset')).toBe(false);
    page.commit(); expect(page.raw().has('offset')).toBe(false);
  });
  it('keeps a valid page when returning from detail/profile without changing location or cards', () => {
    const query = 'start=2026-10-06T14:00&limit=2&offset=4';
    const page = finder(query); page.render(bentley, ['uwa']); page.commit();
    const returned = finder(query);
    expect(returned.render({ ...bentley }, ['uwa']).get('offset')).toBe('4'); returned.commit();
    expect(returned.navigate).not.toHaveBeenCalled();
  });
  it.each(['cards=curtin', 'cards='])('preserves paging when %s overrides changed account preferences', (explicit) => {
    const query = `start=2026-10-06T14:00&${explicit}&limit=2&offset=4`;
    const page = finder(query); page.render(null, []); page.commit();
    const returned = finder(query);
    expect(returned.render(null, ['uwa']).get('offset')).toBe('4'); returned.commit();
    expect(returned.navigate).not.toHaveBeenCalled();
  });
  it('treats reordered and duplicated card declarations as the same ranking context', () => {
    const page = finder('limit=2&offset=4'); page.render(null, ['uwa', 'curtin']); page.commit();
    expect(page.render(null, ['curtin', 'uwa', 'uwa']).get('offset')).toBe('4'); page.commit();
    expect(page.navigate).not.toHaveBeenCalled();
  });
  it('does not turn initial account loading into a spurious context change', () => {
    const page = finder('limit=2&offset=4'); page.render(null, undefined, false); page.commit();
    expect(hooks.lastKey).toBeNull();
    expect(page.render(null, ['uwa']).get('offset')).toBe('4'); page.commit();
    expect(page.navigate).not.toHaveBeenCalled();
    expect(page.render(null, []).has('offset')).toBe(false); page.commit(); // Sign-out changes inherited ranking.
  });
  it('preserves explicit filters, card defaults and device location on a cross-screen card change', () => {
    const query = selected.replace('cards=&', '');
    const page = finder(query); page.render(bentley, []); page.commit();
    const returned = finder(query);
    const request = returned.render(bentley, ['uwa']);
    expect(request.has('offset')).toBe(false);
    for (const [key, value] of new URLSearchParams(query)) if (key !== 'offset') expect(request.get(key)).toBe(value);
    returned.commit();
    expect(returned.raw().has('cards')).toBe(false);
    expect([...returned.raw().keys()]).not.toContain('location');
  });
});
