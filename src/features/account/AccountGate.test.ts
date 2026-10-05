import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AccountContext, type AccountState } from './account-context';
import { AccountGate } from './AccountGate';

const account: AccountState['account'] = { user: { id: 'synthetic', name: 'Test admin', email: 'test@example.invalid' },
  preferences: { suburbId: null, cards: [] }, favouriteIds: [], isAdmin: true };
function render(changes: Partial<AccountState> = {}) {
  const state: AccountState = { account, googleEnabled: false, loading: false, busy: false, error: null,
    refresh: () => undefined, signOut: () => Promise.resolve(), savePreferences: () => Promise.resolve(), setFavourite: () => Promise.resolve(), ...changes };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AccountContext, { value: state },
    createElement(AccountGate, { children: createElement('input', { 'aria-label': 'Unsaved editor', defaultValue: 'Unsaved value' }) }))));
}

describe('authenticated content during account refresh', () => {
  it('retains authenticated content but disables controls on a transient refresh error', () => {
    const html = render({ error: 'Account information couldn’t load.' });
    expect(html).toContain('Unsaved value');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain('Try again');
  });
  it('keeps cached authenticated content disabled during a pending refresh', () => {
    const html = render({ loading: true });
    expect(html).toContain('Unsaved value');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  });
  it('renders enabled content after a successful account check', () => {
    const html = render();
    expect(html).toContain('Unsaved value');
    expect(html).not.toContain('disabled=""');
  });
  it('does not expose authenticated content while initial authentication is pending', () => {
    const html = render({ account: null, loading: true });
    expect(html).toContain('Loading your account');
    expect(html).not.toContain('Unsaved value');
  });
  it('does not expose authenticated content when an initial account check failed', () => {
    const html = render({ account: null, error: 'Account information couldn’t load.' });
    expect(html).toContain('Try again');
    expect(html).not.toContain('Unsaved value');
  });
  it('removes authenticated content after a confirmed guest response', () => {
    const html = render({ account: null });
    expect(html).toContain('Sign in to continue');
    expect(html).not.toContain('Unsaved value');
  });
});
