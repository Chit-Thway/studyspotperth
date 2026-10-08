import { describe, expect, it, vi } from 'vitest';
import { createDeviceLocationController, INITIAL_LOCATION_STATE, type DeviceLocationState } from './device-location-controller';
import { locationDisabled, rememberCoordinates, rememberLocationDisabled, savedCoordinates, type LocationStorage } from './device-location';

function memory(): LocationStorage {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}
class Permission extends EventTarget {
  state: PermissionState;
  readonly name = 'geolocation';
  onchange: PermissionStatus['onchange'] = null;
  constructor(state: PermissionState) { super(); this.state = state; }
  change(state: PermissionState) { this.state = state; this.dispatchEvent(new Event('change')); }
}
const point = (latitude = -31.978945): GeolocationPosition => ({ timestamp: 2000, toJSON: () => ({}), coords: {
  latitude, longitude: 115.817794, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}),
} });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function harness(state: PermissionState = 'granted', storage = memory(), hasPermissions = true) {
  const permission = new Permission(state);
  const pending: { success: PositionCallback; error?: PositionErrorCallback | null }[] = [];
  const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success, error) => { pending.push({ success, error }); });
  const query = vi.fn<Permissions['query']>().mockResolvedValue(permission);
  let snapshot: DeviceLocationState = { ...INITIAL_LOCATION_STATE };
  const controller = createDeviceLocationController({ geolocation: { getCurrentPosition }, permissions: hasPermissions ? { query } : undefined,
    storage, now: () => 2000, onChange: (state) => { snapshot = state; } });
  return { controller, storage, permission, pending, getCurrentPosition, state: () => snapshot };
}

describe('persistent location lifecycle', () => {
  it('does not refresh a saved opt-in before the initial permission check completes', async () => {
    const storage = memory(); rememberCoordinates({ latitude: -32, longitude: 115.9 }, storage, 1000);
    let resolvePermission!: (status: PermissionStatus) => void;
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>();
    const controller = createDeviceLocationController({ storage, geolocation: { getCurrentPosition },
      permissions: { query: () => new Promise((resolve) => { resolvePermission = resolve; }) }, now: () => 2000, onChange: () => undefined });
    const started = controller.start(); controller.refresh();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    resolvePermission(new Permission('prompt')); await started;
    expect(getCurrentPosition).not.toHaveBeenCalled(); controller.dispose();
  });
  it('restores a previous allowed position before refreshing it, without a Perth fallback request', async () => {
    const h = harness(); rememberCoordinates({ latitude: -32, longitude: 115.9 }, h.storage, 1000);
    await h.controller.start();
    expect(h.state()).toMatchObject({ ready: true, loading: true, coordinates: { latitude: -32, longitude: 115.9 } });
    h.pending[0].success(point()); await settle();
    expect(h.state()).toMatchObject({ ready: true, loading: false, coordinates: { latitude: -31.979, longitude: 115.818 } });
    expect(savedCoordinates(h.storage, 2000)?.coordinates).toEqual(h.state().coordinates);
    h.controller.dispose();
  });
  it('waits for the first fix when permission is granted but no saved location exists', async () => {
    const h = harness(); await h.controller.start();
    expect(h.state().ready).toBe(false);
    h.pending[0].success(point()); await settle();
    expect(h.state().ready).toBe(true); h.controller.dispose();
  });
  it.each(['prompt', 'denied'] as const)('does not restore or automatically prompt when permission is %s', async (state) => {
    const h = harness(state); rememberCoordinates({ latitude: -32, longitude: 115.9 }, h.storage, 1000);
    await h.controller.start(); h.controller.refresh();
    expect(h.getCurrentPosition).not.toHaveBeenCalled();
    expect(h.state()).toMatchObject({ ready: true, coordinates: null });
    expect(savedCoordinates(h.storage, 2000)).toBeNull(); h.controller.dispose();
  });
  it('refreshes on navigation and coalesces pending route refreshes into one latest lookup', async () => {
    const h = harness(); await h.controller.start();
    h.pending[0].success(point()); await settle();
    h.controller.refresh(); h.controller.refresh(); h.controller.refresh();
    expect(h.getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(h.state().coordinates).not.toBeNull();
    h.pending[1].success(point(-32)); await settle();
    expect(h.getCurrentPosition).toHaveBeenCalledTimes(3);
    h.pending[2].success(point(-32.001)); await settle();
    expect(h.state().coordinates?.latitude).toBe(-32.001); h.controller.dispose();
  });
  it('turning off is persistent and late callbacks cannot restore location', async () => {
    const h = harness(); await h.controller.start(); h.controller.clear();
    h.pending[0].success(point()); await settle(); h.controller.refresh();
    expect(h.state()).toMatchObject({ coordinates: null, ready: true, loading: false });
    expect(locationDisabled(h.storage)).toBe(true);
    expect(savedCoordinates(h.storage, 2000)).toBeNull();
    const reloaded = harness('granted', h.storage); await reloaded.controller.start();
    expect(reloaded.getCurrentPosition).not.toHaveBeenCalled();
    h.controller.dispose(); reloaded.controller.dispose();
  });
  it('revocation clears stored coordinates and cancels in-flight refresh callbacks', async () => {
    const h = harness(); await h.controller.start(); h.pending[0].success(point()); await settle();
    h.controller.refresh(); h.permission.change('denied'); h.pending[1].success(point(-32)); await settle();
    expect(h.state().coordinates).toBeNull(); expect(savedCoordinates(h.storage, 2000)).toBeNull();
    h.permission.change('granted'); expect(h.getCurrentPosition).toHaveBeenCalledTimes(3); h.controller.dispose();
  });
  it('a denied device request stops automatic retries until permission is granted again', async () => {
    const h = harness(); await h.controller.start();
    h.pending[0].error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); await settle();
    h.controller.refresh(); expect(h.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(h.state()).toMatchObject({ ready: true, loading: false, coordinates: null }); h.controller.dispose();
  });
  it('keeps the last location with an explanatory error when a refresh temporarily fails', async () => {
    const h = harness(); await h.controller.start(); h.pending[0].success(point()); await settle(); h.controller.refresh();
    h.pending[1].error?.({ code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); await settle();
    expect(h.state().coordinates).not.toBeNull(); expect(h.state().error).toContain('Using your last location'); h.controller.dispose();
  });
  it('restores previous opt-in through the native permission gate when Permissions API is unavailable', async () => {
    const h = harness('granted', memory(), false); rememberCoordinates({ latitude: -32, longitude: 115.9 }, h.storage, 1000);
    await h.controller.start(); expect(h.state().ready).toBe(false);
    h.pending[0].success(point()); await settle(); expect(h.state().ready).toBe(true); h.controller.dispose();
  });
  it('continues browsing when the permission query never resolves', async () => {
    vi.useFakeTimers();
    try {
      let snapshot = INITIAL_LOCATION_STATE;
      const controller = createDeviceLocationController({ permissions: { query: () => new Promise<PermissionStatus>(() => undefined) },
        storage: memory(), onChange: (state) => { snapshot = state; } });
      const started = controller.start(); await vi.advanceTimersByTimeAsync(1001); await started;
      expect(snapshot.ready).toBe(true); controller.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('responds to location being turned off or re-enabled in another tab', async () => {
    const h = harness(); await h.controller.start(); h.pending[0].success(point()); await settle();
    rememberLocationDisabled(h.storage, true); h.controller.syncPreference(); expect(h.state().coordinates).toBeNull();
    rememberLocationDisabled(h.storage, false); h.controller.syncPreference(); expect(h.getCurrentPosition).toHaveBeenCalledTimes(2); h.controller.dispose();
  });
  it('does not publish or store a fix after provider disposal', async () => {
    const h = harness(); await h.controller.start(); h.controller.dispose(); h.pending[0].success(point()); await settle();
    expect(savedCoordinates(h.storage, 2000)).toBeNull();
  });
});
