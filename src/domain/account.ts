import type { UniversityCard } from './search-context';
import { isUniversityCard } from './search-request';

export interface Preferences { suburbId: string | null; cards: UniversityCard[] }
export interface AccountProfile {
  user: { id: string; name: string; email: string };
  preferences: Preferences;
  favouriteIds: string[];
  isAdmin: boolean;
}
export interface AccountResponse { account: AccountProfile | null; googleEnabled: boolean }

export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preferences.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['suburbId', 'cards'].includes(key))) throw new Error('Unsupported preference field.');
  if (input.suburbId !== null && (typeof input.suburbId !== 'string' || input.suburbId.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.suburbId))) throw new Error('Select an available suburb.');
  if (!Array.isArray(input.cards) || input.cards.length > 4 || !input.cards.every((card: unknown) => typeof card === 'string' && isUniversityCard(card))) throw new Error('Select supported university cards.');
  return { suburbId: input.suburbId, cards: [...new Set(input.cards)] };
}

/** Explicit URL declarations override profile defaults, including an empty cards selection. */
export function profileFinderParams(params: URLSearchParams, preferences?: Preferences): URLSearchParams {
  const next = new URLSearchParams(params);
  if (preferences) {
    if (!next.has('cards') && preferences.cards.length) next.set('cards', preferences.cards.join(','));
    if (!next.has('suburb') && preferences.suburbId) next.set('suburb', preferences.suburbId);
  }
  return next;
}

/** A filter change must not turn inherited defaults into explicit URL overrides. */
export function preserveProfileDefaults(raw: URLSearchParams, effective: URLSearchParams, next: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams(next);
  for (const key of ['cards', 'suburb']) {
    if (!raw.has(key) && result.get(key) === effective.get(key)) result.delete(key);
  }
  return result;
}

export function internalReturnTo(value: string | null): string {
  if (!value || value.length > 3000 || value.includes('\\') || [...value].some((character) => character.charCodeAt(0) <= 32) || !value.startsWith('/') || value.startsWith('//')) return '/';
  const url = new URL(value, 'https://studyspot.invalid');
  if (url.origin !== 'https://studyspot.invalid' || !(/^\/$|^\/profile$|^\/saved$|^\/libraries\/[a-z0-9]+(?:-[a-z0-9]+)*$|^\/admin(?:\/libraries\/(?:new|[a-zA-Z0-9_-]+))?$/.test(url.pathname))) return '/';
  return `${url.pathname}${url.search}`;
}
