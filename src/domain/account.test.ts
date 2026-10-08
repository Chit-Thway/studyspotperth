import { describe, expect, it } from 'vitest';
import { internalReturnTo, parsePreferences, preserveProfileDefaults, profileFinderParams } from './account';
import { toggleFinderSelection, updateFinderParam } from '../features/finder/finder-state';

describe('account preferences and finder state', () => {
  const profile = { cards: ['uwa'] as const, suburbId: 'crawley' };
  const preferences = { ...profile, cards: [...profile.cards] };
  it('personalises a fresh finder without adding a hard filter', () => {
    const params = profileFinderParams(new URLSearchParams(), preferences);
    expect(params.toString()).toBe('cards=uwa');
    expect(params.has('suburb')).toBe(false);
    expect(params.has('institutions')).toBe(false);
    expect(params.has('open24Hours')).toBe(false);
    expect(params.has('usableWifi')).toBe(false);
  });
  it('retains guest selections and explicit filters across login', () => {
    const raw = new URLSearchParams('cards=curtin&suburb=bentley&institutions=ecu&open24Hours=true&end=2026-10-04T06:00');
    expect(profileFinderParams(raw, preferences).toString()).toBe('cards=curtin&suburb=bentley&institutions=ecu&open24Hours=true');
    expect(raw.get('cards')).toBe('curtin');
  });
  it('changing 24/7 retains inherited preferences rather than freezing them in the URL', () => {
    const raw = new URLSearchParams();
    const effective = profileFinderParams(raw, preferences);
    const next = preserveProfileDefaults(raw, effective, updateFinderParam(effective, 'open24Hours', 'true'));
    expect(next.toString()).toBe('open24Hours=true');
    expect(profileFinderParams(next, { suburbId: null, cards: ['curtin'] }).get('cards')).toBe('curtin');
  });
  it('removing the last card overrides a saved card even after reload', () => {
    const raw = new URLSearchParams();
    const effective = profileFinderParams(raw, preferences);
    const next = preserveProfileDefaults(raw, effective, toggleFinderSelection(effective, 'cards', 'uwa'));
    expect(next.toString()).toBe('cards=');
    expect(profileFinderParams(next, preferences).get('cards')).toBe('');
  });
  it('rejects identity/role injection, unknown cards and malformed suburbs', () => {
    expect(parsePreferences({ suburbId: null, cards: ['uwa', 'uwa'] })).toEqual({ suburbId: null, cards: ['uwa'] });
    for (const body of [{ suburbId: null, cards: ['public'] }, { suburbId: '../private', cards: [] }, { suburbId: null, cards: [], userId: 'another-user' }, { suburbId: null, cards: [], role: 'admin' }]) expect(() => parsePreferences(body)).toThrow();
  });
  it('retiring end time retains an explicit empty card declaration and does not mutate the old URL', () => {
    const raw = new URLSearchParams('end=old&end=duplicate&cards=&start=2026-10-07T14:00&offset=4');
    const clean = profileFinderParams(raw, preferences);
    expect(clean.toString()).toBe('cards=&start=2026-10-07T14%3A00&offset=4');
    expect(raw.getAll('end')).toEqual(['old', 'duplicate']);
    expect(clean.has('institutions')).toBe(false);
  });
});
describe('internal sign-in return locations', () => {
  it('preserves a library and its selected filters', () => {
    expect(internalReturnTo('/libraries/reid?open24Hours=true&institutions=uwa')).toBe('/libraries/reid?open24Hours=true&institutions=uwa');
  });
  it('drops legacy end times from sign-in returns while retaining active duplicates for validation', () => {
    expect(internalReturnTo('/libraries/reid?cards=&start=bad&start=duplicate&end=old&end=duplicate'))
      .toBe('/libraries/reid?cards=&start=bad&start=duplicate');
  });
  it('rejects off-site redirects, malformed paths and recursive sign-in routes', () => {
    for (const value of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/sign-in', '/%2f%2fevil.invalid', '/saved\n', '/admin/users', null]) expect(internalReturnTo(value)).toBe('/');
    expect(internalReturnTo('/admin/libraries/new')).toBe('/admin/libraries/new');
  });
});
