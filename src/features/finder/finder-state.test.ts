import { describe, expect, it } from 'vitest';
import { finderUrl, resetFinderFilters, toggleFinderSelection, updateFinderParam } from './finder-state';

describe('guest finder selections', () => {
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
});
