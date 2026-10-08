import type { Coordinates } from '../../domain/location';

const DISABLED_KEY = 'studyspot_location_disabled';
const ENABLED_KEY = 'studyspot_location_enabled';
const POSITION_KEY = 'studyspot_location_position';
export const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Position writes must not trigger fresh lookups in other tabs.
export const LOCATION_PREFERENCE_KEYS = [DISABLED_KEY, ENABLED_KEY] as const;
export type LocationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface SavedLocation { coordinates: Coordinates; savedAt: number }
export function locationDisabled(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    if ((storage ?? window.localStorage).getItem(DISABLED_KEY) === 'true') return true;
    if (!storage && window.sessionStorage.getItem(DISABLED_KEY) === 'true') {
      rememberLocationDisabled(undefined, true); return true;
    }
    return false;
  } catch { return false; }
}
export function rememberLocationDisabled(storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined, disabled: boolean) {
  try { const target = storage ?? window.localStorage; if (disabled) target.setItem(DISABLED_KEY, 'true'); else target.removeItem(DISABLED_KEY); } catch { /* Turning off still works when storage is blocked. */ }
  if (!storage) try { window.sessionStorage.removeItem(DISABLED_KEY); } catch { /* Older opt-out storage may be unavailable. */ }
}
export function locationEnabled(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? window.localStorage).getItem(ENABLED_KEY) === 'true'; } catch { return false; }
}
export function forgetCoordinates(storage?: Pick<Storage, 'removeItem'>) {
  try { const target = storage ?? window.localStorage; target.removeItem(POSITION_KEY); target.removeItem(ENABLED_KEY); } catch { /* Memory and permission gates still work without storage. */ }
}
export function rememberCoordinates(point: Coordinates, storage?: Pick<Storage, 'setItem'>, savedAt = Date.now()) {
  const coordinates = { latitude: Number(point.latitude.toFixed(3)), longitude: Number(point.longitude.toFixed(3)) };
  try {
    const target = storage ?? window.localStorage;
    target.setItem(POSITION_KEY, JSON.stringify({ version: 1, coordinates, savedAt }));
    target.setItem(ENABLED_KEY, 'true');
  } catch { /* Location remains usable in memory when browser storage is blocked. */ }
}
export function savedCoordinates(storage?: LocationStorage, now = Date.now()): SavedLocation | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(POSITION_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') throw new Error('Invalid saved location.');
    const value = saved as { version?: unknown; coordinates?: Partial<Coordinates>; savedAt?: unknown };
    const point = value.coordinates;
    if (value.version !== 1 || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)
      || value.savedAt < 0 || value.savedAt > now || now - value.savedAt > LOCATION_MAX_AGE_MS
      || !point || typeof point.latitude !== 'number' || typeof point.longitude !== 'number'
      || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
      || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw new Error('Invalid saved location.');
    return { coordinates: { latitude: Number(point.latitude.toFixed(3)), longitude: Number(point.longitude.toFixed(3)) }, savedAt: value.savedAt };
  } catch {
    try { (storage ?? window.localStorage).removeItem(POSITION_KEY); } catch { /* Storage may be inaccessible. */ }
    return null;
  }
}

export class DeviceLocationError extends Error {
  constructor(message: string, public readonly code: number) { super(message); }
}

export function requestCoordinates(geolocation: Pick<Geolocation, 'getCurrentPosition'>): Promise<Coordinates> {
  return new Promise((resolve, reject) => geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      reject(new Error('Location is unavailable. Try again.')); return;
    }
    resolve({ latitude: Number(latitude.toFixed(3)), longitude: Number(longitude.toFixed(3)) });
  }, (error) => reject(new DeviceLocationError(error.code === 1 ? 'Location wasn’t allowed.' : error.code === 3 ? 'Location took too long. Try again.' : 'Location is unavailable. Try again.', error.code)),
  { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 }));
}
