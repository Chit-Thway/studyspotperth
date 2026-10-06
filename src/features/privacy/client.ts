import { CONSENT_COOKIE, VISITOR_COOKIE, cookieChoice, visitorId, type CookieChoice } from '../../domain/privacy';

function writeCookie(name: string, value: string, days: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${days * 86400}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
export function saveCookieChoice(choice: CookieChoice) {
  writeCookie(CONSENT_COOKIE, `v1-${choice}`, 180);
  if (choice === 'essential') writeCookie(VISITOR_COOKIE, '', 0);
  else ensureVisitorCookie();
}
export function ensureVisitorCookie() {
  if (cookieChoice(document.cookie) === 'accepted' && !visitorId(document.cookie)) writeCookie(VISITOR_COOKIE, crypto.randomUUID(), 90);
}
/** Always re-read consent: another tab may have withdrawn it. Failures never block browsing. */
export async function recordUsage(type: 'visit' | 'directions', libraryId?: string): Promise<boolean> {
  if (!visitorId(document.cookie)) return false;
  try {
    const response = await fetch('/api/usage', { method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: crypto.randomUUID(), type, ...(libraryId ? { libraryId } : {}) }) });
    return response.ok;
  } catch { return false; }
}
