import { describe, expect, it } from 'vitest';
import { finderRequestParams, finderUrl, queryUrl, resetFinderFilters, toggleFinderSelection, updateFinderParam } from './finder-state';

describe('guest finder selections', () => {
  it('requests ten cards, including old larger-page links, and preserves return-link state', () => {
    for (const query of ['', 'limit=50', 'limit=100', 'limit=2']) {
      const original = new URLSearchParams(`${query}&offset=20&cards=notre-dame&publicAccess=true`);
      expect(finderRequestParams(original).get('limit')).toBe('10');
      expect(finderRequestParams(original).get('offset')).toBe('20');
      expect(new URL(finderUrl(original, '/libraries/example'), 'https://example.invalid').searchParams.toString()).toBe(original.toString());
      expect(original.get('limit')).toBe(new URLSearchParams(query).get('limit'));
    }
    for (const query of ['limit=0', 'limit=101', 'limit=bad', 'limit=10&limit=50']) {
      expect(finderRequestParams(new URLSearchParams(query)).getAll('limit')).toEqual(new URLSearchParams(query).getAll('limit'));
    }
  });
  it('carries and removes public access separately from university selections', () => {
    const old = new URLSearchParams('institutions=public,uwa&cards=&offset=10&start=2026-10-08T14:00');
    const migrated = new URL(finderUrl(old), 'https://example.invalid').searchParams;
    expect(migrated.get('publicAccess')).toBe('true');
    expect(migrated.get('institutions')).toBe('uwa');
    expect(migrated.has('offset')).toBe(false);
    expect(updateFinderParam(migrated, 'publicAccess', null).get('institutions')).toBe('uwa');
    expect(resetFinderFilters(migrated).has('publicAccess')).toBe(false);
    expect(old.get('institutions')).toBe('public,uwa');
  });
  it('retired end times disappear from API, detail and return links without changing pagination or cards', () => {
    const params = new URLSearchParams('cards=&start=2026-10-07T14:00&offset=4&end=invalid&end=duplicate');
    expect(queryUrl(params, '/api/libraries')).toBe('/api/libraries?cards=&start=2026-10-07T14%3A00&offset=4');
    expect(finderUrl(params, '/libraries/reid')).toBe('/libraries/reid?cards=&start=2026-10-07T14%3A00&offset=4');
    expect(params.getAll('end')).toEqual(['invalid', 'duplicate']);
  });
  it('reset retains cards and origin while removing restrictions, end time and pagination', () => {
    const selected = new URLSearchParams('cards=uwa,curtin&suburb=fixture-cbd&institutions=uwa&open24Hours=true&usableWifi=true&quietStudy=true&start=2026-10-02T14:00&end=2026-10-03T06:00&offset=50');
    expect(resetFinderFilters(selected).toString()).toBe('cards=uwa%2Ccurtin&suburb=fixture-cbd');
    expect(selected.get('institutions')).toBe('uwa');
  });
  it('declaring cards leaves institutions independent and returns to the first page', () => {
    const selected = new URLSearchParams('institutions=curtin&open24Hours=true&offset=50');
    const next = toggleFinderSelection(selected, 'cards', 'uwa');
    expect(next.get('institutions')).toBe('curtin');
    expect(next.get('cards')).toBe('uwa');
    expect(next.has('offset')).toBe(false);
    expect(toggleFinderSelection(next, 'institutions', 'curtin').get('cards')).toBe('uwa');
  });
  it('detail and return links preserve explicit selections', () => {
    const selected = new URLSearchParams('cards=uwa&institutions=curtin&open24Hours=true&start=2026-10-02T14:00');
    const detail = new URL(finderUrl(selected, '/libraries/example'), 'https://example.invalid');
    expect(detail.searchParams.toString()).toBe(selected.toString());
    expect(finderUrl(detail.searchParams)).toBe(`/?${selected.toString()}`);
    expect(updateFinderParam(selected, 'open24Hours', null).get('cards')).toBe('uwa');
  });
  it('public navigation excludes admin cursors without dropping supported selections', () => {
    const params = new URLSearchParams('after=beasley-law-library&cards=uwa&institutions=curtin&open24Hours=true&start=2007-01-01T12:00&offset=50');
    const url = new URL(finderUrl(params), 'https://example.invalid');
    expect(url.searchParams.has('after')).toBe(false);
    expect(url.searchParams.get('cards')).toBe('uwa');
    expect(url.searchParams.get('institutions')).toBe('curtin');
    expect(url.searchParams.get('open24Hours')).toBe('true');
    expect(url.searchParams.get('start')).toBe('2007-01-01T12:00');
    expect(url.searchParams.get('offset')).toBe('50');
    expect(params.get('after')).toBe('beasley-law-library');
    expect(new URL(finderUrl(params, '/profile'), 'https://example.invalid').searchParams.has('after')).toBe(false);
    expect(new URL(finderUrl(params, '/saved'), 'https://example.invalid').searchParams.has('after')).toBe(false);
  });
  it('keeps invalid supported values and duplicates for API validation', () => {
    expect(finderUrl(new URLSearchParams('after=x&cards=&start=invalid&start=duplicate')))
      .toBe('/?cards=&start=invalid&start=duplicate');
  });
  it('Clear all recovers from an unsupported query parameter and retains profile declarations', () => {
    expect(resetFinderFilters(new URLSearchParams('after=x&unexpected=y&cards=&suburb=perth-cbd&open24Hours=true')).toString())
      .toBe('cards=&suburb=perth-cbd');
  });
  it('API URLs retain unsupported keys and duplicates for validation', () => {
    const params = new URLSearchParams('after=x&start=invalid&start=duplicate');
    expect(queryUrl(params, '/api/libraries')).toBe('/api/libraries?after=x&start=invalid&start=duplicate');
    expect(queryUrl(params, '/api/libraries/example')).toBe('/api/libraries/example?after=x&start=invalid&start=duplicate');
  });
});
