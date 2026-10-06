import type { Coordinates } from '../../domain/location';

const DISABLED_KEY = 'studyspot_location_disabled';
export function locationDisabled(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? window.sessionStorage).getItem(DISABLED_KEY) === 'true'; } catch { return false; }
}
export function rememberLocationDisabled(storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined, disabled: boolean) {
  try { const target = storage ?? window.sessionStorage; if (disabled) target.setItem(DISABLED_KEY, 'true'); else target.removeItem(DISABLED_KEY); } catch { /* Turning off still works when storage is blocked. */ }
}

export function requestCoordinates(geolocation: Pick<Geolocation, 'getCurrentPosition'>): Promise<Coordinates> {
  return new Promise((resolve, reject) => geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      reject(new Error('Location is unavailable. Try again.')); return;
    }
    resolve({ latitude: Number(latitude.toFixed(3)), longitude: Number(longitude.toFixed(3)) });
  }, (error) => reject(new Error(error.code === 1 ? 'Location wasn’t allowed.' : error.code === 3 ? 'Location took too long. Try again.' : 'Location is unavailable. Try again.')),
  { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 }));
}
