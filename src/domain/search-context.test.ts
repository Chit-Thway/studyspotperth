import { describe, expect, it } from 'vitest';
import { createSearchContext, updateAccessProfile } from './search-context';

describe('profile and explicit filter separation', () => {
  it('does not turn a saved UWA card into preset hard filters', () => {
    const context = createSearchContext({ suburb: 'Crawley', universityCards: ['uwa'] });
    expect(context.profile.universityCards).toEqual(['uwa']);
    expect(context.filters.institutions).toEqual([]);
    expect(Object.values(context.filters).filter((value) => value === true)).toEqual([]);
  });

  it('loading a profile preserves explicit session filters without adding institutions', () => {
    const guest = createSearchContext({ suburb: 'Perth CBD', universityCards: [] });
    const filtered = { ...guest, filters: { ...guest.filters, institutions: ['curtin'] as const, open24Hours: true } };
    const signedIn = updateAccessProfile(filtered, { suburb: 'Crawley', universityCards: ['uwa'] });
    expect(signedIn.filters).toEqual(filtered.filters);
    expect(signedIn.filters.institutions).toEqual(['curtin']);
    expect(signedIn.profile.universityCards).toEqual(['uwa']);
    expect(guest.profile.universityCards).toEqual([]);
  });
});
