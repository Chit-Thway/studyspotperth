import { describe, expect, it } from 'vitest';
import { savedQuery } from './saved-query';
import { profileFinderParams } from '../../domain/account';

describe('saved-library evaluation context', () => {
  it('retains the selected session and profile defaults while dropping finder restrictions', () => {
    const effective = profileFinderParams(new URLSearchParams('start=2026-10-05T14:00&end=2026-10-05T17:00&institutions=uwa&open24Hours=true&usableWifi=true&quietStudy=true&offset=20'), { cards: ['uwa'], suburbId: 'perth-cbd' });
    const query = savedQuery(effective);
    expect(Object.fromEntries(query.params)).toEqual({ start: '2026-10-05T14:00', end: '2026-10-05T17:00', cards: 'uwa', suburb: 'perth-cbd' });
    expect(query.refreshNow).toBe(false);
  });
  it('refreshes current-time saved evaluations when no fixed start is selected', () => {
    const query = savedQuery(new URLSearchParams('cards=&end=2026-10-05T23:00'));
    expect(query.params.get('cards')).toBe('');
    expect(query.params.get('end')).toBe('2026-10-05T23:00');
    expect(query.refreshNow).toBe(true);
  });
  it('preserves invalid duplicate session parameters for API validation', () => {
    expect(savedQuery(new URLSearchParams('start=invalid&start=2026-10-05T14:00')).params.getAll('start'))
      .toEqual(['invalid', '2026-10-05T14:00']);
  });
});
