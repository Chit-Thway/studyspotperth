export const CONSENT_COOKIE = 'studyspot_consent';
export const VISITOR_COOKIE = 'studyspot_visitor';
export type CookieChoice = 'accepted' | 'essential';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cookieValue(cookies: string, name: string): string | null {
  const values = cookies.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); } catch { return null; }
}
export function cookieChoice(cookies: string): CookieChoice | null {
  const value = cookieValue(cookies, CONSENT_COOKIE);
  return value === 'v1-accepted' ? 'accepted' : value === 'v1-essential' ? 'essential' : null;
}
export function visitorId(cookies: string): string | null {
  if (cookieChoice(cookies) !== 'accepted') return null;
  const value = cookieValue(cookies, VISITOR_COOKIE);
  return value && UUID_PATTERN.test(value) ? value : null;
}
export interface UsageSummary {
  from: string; to: string;
  actors: { kind: 'account' | 'anonymous'; active: number; returning: number }[];
  directionsClicks: number;
  favourites: number;
}
