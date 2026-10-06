import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_COOKIE, VISITOR_COOKIE, cookieChoice, visitorId } from '../../domain/privacy';
import { recordUsage, saveCookieChoice } from './client';

const id = 'f3c0a609-2ccc-4ef2-9a42-b04ce9f5439d';
let cookies: Map<string, string>;
let writes: string[];
beforeEach(() => {
  cookies = new Map([['better-auth.session_token', 'essential-session']]); writes = [];
  vi.stubGlobal('document', {
    get cookie() { return Array.from(cookies, ([key, value]) => `${key}=${value}`).join('; '); },
    set cookie(value: string) {
      writes.push(value); const [name, data] = value.split(';')[0].split('=');
      if (value.includes('Max-Age=0;')) cookies.delete(name); else cookies.set(name, data);
    },
  });
  vi.stubGlobal('location', { protocol: 'https:' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => vi.unstubAllGlobals());
describe('optional cookie consent', () => {
  it('never sends usage before a choice or with only essential cookies', async () => {
    expect(await recordUsage('visit')).toBe(false);
    saveCookieChoice('essential');
    expect(await recordUsage('directions', 'some-library')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(cookies.has(VISITOR_COOKIE)).toBe(false);
    expect(cookies.get('better-auth.session_token')).toBe('essential-session');
  });
  it('creates an identifier only after acceptance, preserves it and uses secure host cookies', async () => {
    saveCookieChoice('accepted');
    const first = visitorId(document.cookie);
    expect(first).not.toBeNull();
    saveCookieChoice('accepted');
    expect(visitorId(document.cookie)).toBe(first);
    expect(writes.every((value) => value.includes('Path=/;') && value.includes('SameSite=Lax; Secure'))).toBe(true);
    expect(await recordUsage('directions', 'some-library')).toBe(true);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = init?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '')).toMatchObject({ type: 'directions', libraryId: 'some-library' });
    expect(init?.keepalive).toBe(true);
  });
  it('withdraws consent immediately without logging out or retaining the visitor cookie', async () => {
    saveCookieChoice('accepted');
    saveCookieChoice('essential');
    expect(cookieChoice(document.cookie)).toBe('essential');
    expect(visitorId(document.cookie)).toBeNull();
    expect(await recordUsage('visit')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(cookies.get('better-auth.session_token')).toBe('essential-session');
  });
  it('rechecks consent changed in another tab before recording a click', async () => {
    cookies.set(CONSENT_COOKIE, 'v1-accepted'); cookies.set(VISITOR_COOKIE, id);
    expect(await recordUsage('visit')).toBe(true);
    cookies.set(CONSENT_COOKIE, 'v1-essential');
    expect(await recordUsage('directions', 'some-library')).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not trust stale, malformed or duplicate consent/identifier cookies', () => {
    for (const value of [`${VISITOR_COOKIE}=${id}`, `${CONSENT_COOKIE}=v0-accepted; ${VISITOR_COOKIE}=${id}`,
      `${CONSENT_COOKIE}=v1-accepted; ${CONSENT_COOKIE}=v1-essential; ${VISITOR_COOKIE}=${id}`,
      `${CONSENT_COOKIE}=v1-accepted; ${VISITOR_COOKIE}=%bad`, `${CONSENT_COOKIE}=v1-accepted; ${VISITOR_COOKIE}=not-a-uuid`]) expect(visitorId(value)).toBeNull();
  });
  it('does not break navigation when the usage endpoint fails', async () => {
    saveCookieChoice('accepted'); vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    expect(await recordUsage('directions', 'some-library')).toBe(false);
  });
});
