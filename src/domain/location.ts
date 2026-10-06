import { SearchValidationError, type SearchOrigin } from './search-request';

export interface Coordinates { latitude: number; longitude: number }
export const LOCATION_HEADER = 'X-StudySpot-Location';
export function locationOrigin(value: string | null): SearchOrigin | null {
  if (value === null) return null;
  if (value.length > 50 || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) throw new SearchValidationError('location', 'Location is unavailable. Try again.');
  const [latitude, longitude] = value.split(',').map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new SearchValidationError('location', 'Location is unavailable. Try again.');
  return { id: 'device-location', name: 'Your location', latitude, longitude };
}
export function locationHeader(point?: Coordinates | null): string | null {
  return point ? `${point.latitude},${point.longitude}` : null;
}
