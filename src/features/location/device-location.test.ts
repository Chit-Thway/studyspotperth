import { describe, expect, it, vi } from 'vitest';
import { locationDisabled, rememberLocationDisabled, requestCoordinates, rememberCoordinates, savedCoordinates, forgetCoordinates, LOCATION_MAX_AGE_MS } from './device-location';
import { LOCATION_HEADER, locationHeader, locationOrigin } from '../../domain/location';
import { readLibraryApi } from '../libraries/api';

const position = (latitude: number, longitude: number): GeolocationPosition => ({ timestamp: 0, toJSON: () => ({}), coords: {
  latitude, longitude, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}),
} });
describe('device location and request privacy', () => {
  it('persists turning location off without storing coordinates', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    expect(locationDisabled(storage)).toBe(false);
    rememberLocationDisabled(storage, true);
    expect(locationDisabled(storage)).toBe(true);
    expect([...data.values()]).toEqual(['true']);
    rememberLocationDisabled(storage, false);
    expect(locationDisabled(storage)).toBe(false);
    expect(() => rememberLocationDisabled({ setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined }, true)).not.toThrow();
  });
  it('uses approximate coordinates and a bounded one-time lookup', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) => success(position(-31.978945, 115.817794)));
    expect(await requestCoordinates({ getCurrentPosition })).toEqual({ latitude: -31.979, longitude: 115.818 });
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, maximumAge: 0, timeout: 10000 });
  });
  it('remains usable when the browser blocks access to storage itself', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('storage disabled'); }, get sessionStorage() { throw new Error('storage disabled'); } });
    try {
      expect(locationDisabled()).toBe(false);
      expect(() => rememberLocationDisabled(undefined, true)).not.toThrow();
      expect(() => rememberCoordinates({ latitude: -31.979, longitude: 115.818 })).not.toThrow();
      expect(savedCoordinates()).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it('saves only rounded coordinates and expires or clears the previous location', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    rememberCoordinates({ latitude: -31.978945, longitude: 115.817794 }, storage, 1000);
    expect(savedCoordinates(storage, 2000)).toEqual({ coordinates: { latitude: -31.979, longitude: 115.818 }, savedAt: 1000 });
    expect([...data.values()].join('')).not.toContain('-31.978945');
    expect(savedCoordinates(storage, 1001 + LOCATION_MAX_AGE_MS)).toBeNull();
    rememberCoordinates({ latitude: 0, longitude: 0 }, storage, 1000);
    expect(savedCoordinates(storage, 999)).toBeNull();
    rememberCoordinates({ latitude: 0, longitude: 0 }, storage, 1000);
    forgetCoordinates(storage);
    expect(data.size).toBe(0);
  });
  it.each([[1, 'wasn’t allowed'], [2, 'unavailable'], [3, 'too long']])('handles device failure %s without waiting indefinitely', async (code, message) => {
    const getCurrentPosition: Geolocation['getCurrentPosition'] = (_success, error) => error?.({ code, message: 'synthetic failure', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    await expect(requestCoordinates({ getCurrentPosition })).rejects.toThrow(message);
  });
  it('rejects invalid device coordinates', async () => {
    await expect(requestCoordinates({ getCurrentPosition: (success) => success(position(NaN, 115)) })).rejects.toThrow('unavailable');
  });
  it('validates header pairs, bounds, empty values and duplicate combined headers', () => {
    expect(locationOrigin(null)).toBeNull();
    expect(locationOrigin('-31.979,115.818')).toMatchObject({ id: 'device-location', latitude: -31.979, longitude: 115.818 });
    expect(locationOrigin('0,0')).toMatchObject({ latitude: 0, longitude: 0 });
    for (const value of ['', 'NaN,115', '-31.9', '91,0', '0,181', '-31.9,115,0', '-31.9,115.8, -32,116', '1e2,0']) expect(() => locationOrigin(value)).toThrow();
    expect(locationHeader(null)).toBeNull();
  });
  it('sends location as a request header without putting coordinates in the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await readLibraryApi('/api/libraries?cards=uwa', new AbortController().signal, '-31.979,115.818');
      expect(fetchMock.mock.calls[0][0]).toBe('/api/libraries?cards=uwa');
      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ [LOCATION_HEADER]: '-31.979,115.818' });
    } finally { vi.unstubAllGlobals(); }
  });
});
