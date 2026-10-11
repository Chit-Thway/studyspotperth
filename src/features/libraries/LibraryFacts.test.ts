import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { libraryFixtures } from '../../../tests/fixtures/libraries';
import { evaluateLibrary } from '../../domain/library-search';
import { parseSearchRequest } from '../../domain/search-request';
import { parsePerthTime } from '../../domain/perth-time';
import { LibraryFacts, LibraryEntryRequirements } from './LibraryFacts';
import { cardEntryLabel, entryDayHoursLabel, openingDayLabel, UNIVERSITY_CARDS } from './presentation';
import { launchLibraries } from '../../../server/data/launch-libraries';
import { LibraryDetailContent } from './LibraryDetailPage';
import { LibraryCard } from './LibraryCard';
import { AccountContext, type AccountState } from '../account/account-context';

const guestAccount: AccountState = { account: null, googleEnabled: false, loading: false, busy: false, error: null,
  refresh: () => undefined, savePreferences: () => Promise.resolve(), setFavourite: () => Promise.resolve(),
  signOut: () => Promise.resolve(), registerSignOutGuard: () => () => undefined };

function result(id: string, query = '') {
  const library = libraryFixtures.find((item) => item.id === `fixture-${id}`)!;
  return evaluateLibrary({ ...library, status: 'published', isFixture: true, revisionId: 'test' },
    parseSearchRequest(new URLSearchParams(query), parsePerthTime('2026-10-02T18:00')));
}
function render(id: string, query = '') {
  return renderToStaticMarkup(createElement(LibraryFacts, { result: result(id, query), compact: true }));
}
function earlyResult(date: string) {
  const library = structuredClone(libraryFixtures.find((item) => item.id === 'fixture-public')!);
  const dayHours = (early: boolean) => Array.from({ length: 7 }, (_, weekday) => ({ weekday,
    startMinute: weekday === 0 || weekday === 6 ? early ? 540 : 780 : early ? 420 : 540,
    endMinute: weekday === 0 || weekday === 6 ? 1020 : 1320 }));
  library.content.schedule.building.recurring = dayHours(true);
  library.content.schedule.access[0].recurring = dayHours(false);
  library.content.schedule.access.push({ ...structuredClone(library.content.schedule.building), group: 'uwa',
    requirement: 'UWA card required', needsActiveCredentials: false });
  return evaluateLibrary({ ...library, status: 'published', isFixture: true, revisionId: 'test' },
    parseSearchRequest(new URLSearchParams({ start: `${date}T14:00` }), parsePerthTime('2026-10-07T14:00')));
}

describe('entry badges on library cards', () => {
  it('shows a 24/7 library as open under Open now while retaining unmatched card requirements', () => {
    const evaluated = result('uwa');
    const params = new URLSearchParams('openNow=true');
    const html = renderToStaticMarkup(createElement(AccountContext.Provider, { value: guestAccount },
      createElement(MemoryRouter, {}, createElement(LibraryCard, { result: evaluated, params }))));
    expect(html).toContain('<strong>Open 24 hours Fri</strong>');
    expect(html).toContain('24/7 · UWA card');
    expect(html).toContain('Not in your declared cards');
    expect(html).not.toContain('Closed · Open');
  });
  it.each(launchLibraries.map((library) => [library.slug, library] as const))('keeps the real card and detail consistent for every access profile at %s', (_slug, library) => {
    for (const start of ['2026-10-07T14:00', '2026-10-07T23:48']) for (const cards of ['', ...UNIVERSITY_CARDS]) {
      const params = new URLSearchParams({ start, cards });
      const evaluated = evaluateLibrary({ ...library, revisionId: 'test', status: 'published', isFixture: false },
        parseSearchRequest(params, parsePerthTime(start)));
      const card = renderToStaticMarkup(createElement(AccountContext.Provider, { value: guestAccount },
        createElement(MemoryRouter, { initialEntries: [`/?${params}`] }, createElement(LibraryCard, { result: evaluated, params }))));
      const detail = renderToStaticMarkup(createElement(LibraryDetailContent, { result: evaluated, preview: true }));
      const badges = renderToStaticMarkup(createElement(LibraryEntryRequirements, { result: evaluated }));
      const hours = openingDayLabel(evaluated);
      for (const html of [card, detail]) {
        expect(html).toContain(badges);
        expect(html).toContain(`<strong>${hours}</strong>`);
      }
      if (!cards) expect(hours).not.toContain('24 hours');
      if (!evaluated.access.window && evaluated.access.nextWindow) expect(hours).toMatch(/^Closed · Open /);
      expect(hours).not.toMatch(/\b2026\b/);
    }
  });
  it('labels weekday early access separately from public hours', () => {
    const evaluated = earlyResult('2026-10-07');
    const html = renderToStaticMarkup(createElement(LibraryFacts, { result: evaluated, compact: true }));
    expect(html).toContain('7 am access · UWA card');
    expect(html).toContain('Entry hours: 9 am–10 pm');
    expect(html).toContain('Entry hours: 7 am–10 pm');
    expect(evaluated.open24Hours.status).toBe('does-not-qualify');
  });
  it('uses weekend hours instead of repeating the weekday access time', () => {
    const evaluated = earlyResult('2026-10-10');
    expect(cardEntryLabel(evaluated, 'uwa')).toBe('9 am access · UWA card');
    expect(entryDayHoursLabel(evaluated, 'public')).toBe('1 pm–5 pm');
  });
  it('does not offer early entry before a replacement building opening time', () => {
    const evaluated = earlyResult('2026-10-07');
    evaluated.library.content.schedule.building.overrides.push({ id: 'late-opening', kind: 'date',
      startDate: '2026-10-07', endDate: '2026-10-07', status: 'hours',
      intervals: [{ weekday: 3, startMinute: 480, endMinute: 1320 }], sourceId: 'fictional-source' });
    expect(cardEntryLabel(evaluated, 'uwa')).toBe('8 am access · UWA card');
    evaluated.library.content.schedule.building.overrides[0].status = 'closed';
    evaluated.library.content.schedule.building.overrides[0].intervals = [];
    expect(cardEntryLabel(evaluated, 'uwa')).toBeUndefined();
    expect(entryDayHoursLabel(evaluated, 'uwa')).toBe('Closed');
  });
  it('separates public entry from the card needed for 24/7, even outside public hours', () => {
    const html = render('uwa');
    expect(html).toMatch(/data-group="public"[^>]*title="Public entry during daytime hours/);
    expect(html).toContain('Public access');
    expect(html).toContain('24/7 · UWA card');
    expect(html).toContain('Not in your declared cards');
    expect(html).not.toContain('Public entry now');
    expect(render('uwa', 'cards=uwa')).toContain('Matches your declared cards');
  });
  it('never invents public access for a card-only library', () => {
    const html = render('curtin');
    expect(html).toContain('24/7 · Curtin card');
    expect(html).not.toContain('data-group="public"');
  });
  it('does not imply that a card is required when public entry itself is 24/7', () => {
    const library = structuredClone(libraryFixtures.find((item) => item.id === 'fixture-uwa')!);
    library.content.schedule.access[0].recurring = structuredClone(library.content.schedule.building.recurring);
    const evaluated = evaluateLibrary({ ...library, status: 'published', isFixture: true, revisionId: 'test' },
      parseSearchRequest(new URLSearchParams(), parsePerthTime('2026-10-07T23:48')));
    for (const compact of [true, false]) {
      const html = renderToStaticMarkup(createElement(LibraryFacts, { result: evaluated, compact }));
      expect(html).toContain('Public access');
      expect(html).not.toContain('data-group="uwa"');
      expect(html).toContain('Open 24 hours Wed');
    }
  });
  it('does not turn unconfirmed public hours into a public-access badge', () => {
    const library = structuredClone(libraryFixtures.find((item) => item.id === 'fixture-uwa')!);
    const publicEntry = library.content.schedule.access.find((entry) => entry.group === 'public')!;
    publicEntry.status = 'unknown';
    publicEntry.recurring = [];
    publicEntry.requirement = 'Public entry hours unconfirmed';
    const evaluated = evaluateLibrary({ ...library, status: 'published', isFixture: true, revisionId: 'test' },
      parseSearchRequest(new URLSearchParams(), parsePerthTime('2026-10-02T18:00')));
    const html = renderToStaticMarkup(createElement(LibraryFacts, { result: evaluated, compact: true }));
    expect(html).toContain('24/7 · UWA card');
    expect(html).not.toContain('data-group="public"');
  });
  it('keeps the public badge for the next confirmed public opening on a closed day', () => {
    const library = structuredClone(libraryFixtures.find((item) => item.id === 'fixture-uwa')!);
    library.content.schedule.access.find((entry) => entry.group === 'public')!.overrides.push({ id: 'public-closure',
      kind: 'date', startDate: '2026-10-02', endDate: '2026-10-02', status: 'closed', intervals: [], sourceId: 'fictional-source' });
    const evaluated = evaluateLibrary({ ...library, status: 'published', isFixture: true, revisionId: 'test' },
      parseSearchRequest(new URLSearchParams(), parsePerthTime('2026-10-02T18:00')));
    const html = renderToStaticMarkup(createElement(LibraryFacts, { result: evaluated, compact: true }));
    expect(html).toContain('24/7 · UWA card');
    expect(html).toContain('data-group="public"');
    expect(html).toContain('Closed · Open 9 am–5 pm Sat');
  });
  it.each(['tl-robertson-library', 'geoffrey-bolton-library'])('keeps public access and card conditions consistent across the card and detail at %s', (slug) => {
    const library = launchLibraries.find((item) => item.slug === slug)!;
    const evaluated = evaluateLibrary({ ...library, revisionId: 'test', status: 'published', isFixture: false },
      parseSearchRequest(new URLSearchParams({ start: '2026-10-07T23:48' }), parsePerthTime('2026-10-07T23:48')));
    const card = renderToStaticMarkup(createElement(LibraryFacts, { result: evaluated, compact: true }));
    const detail = renderToStaticMarkup(createElement(LibraryDetailContent, { result: evaluated, preview: true }));
    for (const html of [card, detail]) {
      expect(html).toContain('data-group="public"');
      expect(html).toContain(`24/7 · ${library.institution === 'curtin' ? 'Curtin' : 'Murdoch'} card`);
      expect(html).toContain('Closed · Open 8 am–');
      expect(html).toContain(' pm Thu');
      expect(html).not.toContain('Available until');
      expect(html).not.toContain('Open 24 hours');
    }
  });
  it('keeps negative and unknown 24/7 statuses distinguishable without relying on colour', () => {
    const html = render('public');
    expect(html).toContain('data-status="does-not-qualify"');
    expect(html).toContain('data-icon="close"');
    expect(html).toContain('24/7 access');
    expect(html).toContain('not available');
    expect(html).not.toContain('No 24/7');
    expect(render('unknown')).toContain('24/7 unknown');
    expect(render('unknown')).not.toContain('not available');
  });
});
