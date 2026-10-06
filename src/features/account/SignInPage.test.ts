import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AccountContext, type AccountState } from './account-context';
import { SignInPage } from './SignInPage';

vi.mock('./client', () => ({ authClient: { signIn: { social: vi.fn() } } }));
const guest: AccountState = { account: null, googleEnabled: false, loading: false, busy: false, error: null,
  refresh: () => undefined, signOut: () => Promise.resolve(), registerSignOutGuard: () => () => undefined,
  savePreferences: () => Promise.resolve(), setFavourite: () => Promise.resolve() };
function render(target: string | null) {
  const query = target === null ? '' : `?${new URLSearchParams({ returnTo: target })}`;
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/sign-in${query}`] },
    createElement(AccountContext, { value: guest }, createElement(SignInPage))));
}
function destination(html: string) {
  return html.match(/<a[^>]*href="([^"]*)"[^>]*>Continue browsing<\/a>/)?.[1].replaceAll('&amp;', '&');
}
describe('continuing guest browsing from sign-in (#16)', () => {
  it('preserves the actual detail-return search while returning to the finder', () => {
    const selected = new URLSearchParams('cards=uwa&institutions=curtin&open24Hours=true&start=2026-10-06T20:00&end=2026-10-07T06:00&limit=2&offset=4');
    const html = render(`/libraries/tl-robertson-library?${selected}`);
    const continued = new URL(destination(html)!, 'https://example.invalid');
    expect(continued.pathname).toBe('/');
    expect(continued.searchParams.toString()).toBe(selected.toString());
    const back = html.match(/<a[^>]*href="([^"]*)"[^>]*>← Back<\/a>/)?.[1].replaceAll('&amp;', '&');
    expect(back).toBe(`/libraries/tl-robertson-library?${selected}`);
  });
  it('retains empty explicit cards, duplicates and invalid supported values for validation', () => {
    const continued = new URL(destination(render('/?cards=&start=bad&start=duplicate'))!, 'https://example.invalid');
    expect(continued.searchParams.getAll('start')).toEqual(['bad', 'duplicate']);
    expect(continued.searchParams.has('cards')).toBe(true);
    expect(continued.searchParams.get('cards')).toBe('');
  });
  it.each([null, 'https://evil.invalid/', '//evil.invalid/', '/sign-in'])('uses a safe root fallback for %s', (target) => {
    expect(destination(render(target))).toBe('/');
  });
  it('does not copy admin-only pagination into the public finder', () => {
    expect(destination(render('/admin?after=beasley-law-library'))).toBe('/');
  });
});
