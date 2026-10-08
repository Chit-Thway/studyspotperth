import type { Coordinates } from '../../domain/location';
import { DeviceLocationError, forgetCoordinates, LOCATION_MAX_AGE_MS, locationDisabled, locationEnabled,
  rememberCoordinates, rememberLocationDisabled, requestCoordinates, savedCoordinates, type LocationStorage } from './device-location';

export interface DeviceLocationState { coordinates: Coordinates | null; ready: boolean; loading: boolean; error: string | null }
export const INITIAL_LOCATION_STATE: DeviceLocationState = { coordinates: null, ready: false, loading: false, error: null };
interface Dependencies {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'>;
  permissions?: Pick<Permissions, 'query'>;
  storage?: LocationStorage;
  now?: () => number;
  onChange: (state: DeviceLocationState) => void;
}

/** Owns permission, saved-position and request races; React subscribes to this state. */
export function createDeviceLocationController({ geolocation, permissions, storage, now = Date.now, onChange }: Dependencies) {
  let state = { ...INITIAL_LOCATION_STATE };
  let disposed = false;
  let initialized = false;
  let sequence = 0;
  let inFlight = false;
  let refreshQueued = false;
  let deniedByRequest = false;
  let granted = false;
  let disabled = locationDisabled(storage);
  let savedAt = 0;
  let permission: PermissionStatus | undefined;
  const publish = (change: Partial<DeviceLocationState>) => {
    if (disposed) return;
    state = { ...state, ...change }; onChange(state);
  };
  const revoke = () => {
    if (disposed) return;
    ++sequence; inFlight = false; refreshQueued = false; granted = false; savedAt = 0;
    forgetCoordinates(storage);
    publish({ coordinates: null, ready: true, loading: false, error: null });
  };
  const lookup = (explicit: boolean) => {
    if (disposed) return;
    if (!explicit && (disabled || !granted)) return;
    if (inFlight) { if (!explicit) refreshQueued = true; return; }
    if (explicit) { disabled = false; deniedByRequest = false; rememberLocationDisabled(storage, false); }
    const version = ++sequence;
    if (!geolocation) { publish({ ready: true, loading: false, error: 'Location isn’t supported here.' }); return; }
    inFlight = true;
    publish({ loading: true, error: null });
    void requestCoordinates(geolocation).then((point) => {
      if (disposed || version !== sequence) return;
      granted = true; savedAt = now(); rememberCoordinates(point, storage, savedAt);
      publish({ coordinates: point, ready: true });
    }).catch((failure: unknown) => {
      if (disposed || version !== sequence) return;
      if (failure instanceof DeviceLocationError && failure.code === 1) { deniedByRequest = true; revoke(); }
      const denied = failure instanceof DeviceLocationError && failure.code === 1;
      const point = denied || now() - savedAt > LOCATION_MAX_AGE_MS ? null : state.coordinates;
      publish({ coordinates: point, ready: true, error: `${failure instanceof Error ? failure.message : 'Location is unavailable.'}${point ? ' Using your last location.' : ''}` });
    }).finally(() => {
      if (disposed || version !== sequence) return;
      inFlight = false; publish({ ready: true, loading: false });
      if (refreshQueued) { refreshQueued = false; refresh(); }
    });
  };
  const refresh = () => {
    if (disposed || deniedByRequest || !initialized) return;
    if (permission) {
      if (permission.state !== 'granted') { revoke(); return; }
      granted = true;
    } else if (locationEnabled(storage)) granted = true;
    lookup(false);
  };
  const permissionChanged = () => {
    if (disposed) return;
    if (permission?.state === 'granted') { deniedByRequest = false; granted = true; if (!inFlight) refresh(); } else revoke();
  };
  const start = async () => {
    if (disposed) return;
    if (permissions) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const status = await Promise.race([permissions.query({ name: 'geolocation' }),
          new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Permission lookup timed out.')), 1000); })]);
        if (disposed) return;
        initialized = true;
        permission = status; permission.addEventListener('change', permissionChanged);
        granted = permission.state === 'granted';
        if (!granted) { revoke(); return; }
        if (disabled) { forgetCoordinates(storage); publish({ ready: true }); return; }
        const saved = savedCoordinates(storage, now());
        if (saved) { savedAt = saved.savedAt; publish({ coordinates: saved.coordinates, ready: true }); }
        refresh(); return;
      } catch { /* Previously enabled browsers can refresh through the native permission gate. */ }
      finally { if (timeout !== undefined) clearTimeout(timeout); }
    }
    if (disposed) return;
    initialized = true;
    if (!disabled && locationEnabled(storage)) { granted = true; lookup(false); }
    else publish({ ready: true });
  };
  return {
    start, refresh,
    request: () => lookup(true),
    clear: () => { if (!disposed) { disabled = true; rememberLocationDisabled(storage, true); revoke(); } },
    syncPreference: () => {
      if (disposed) return;
      disabled = locationDisabled(storage);
      if (disabled) revoke(); else { if (locationEnabled(storage)) deniedByRequest = false; refresh(); }
    },
    dispose: () => { disposed = true; ++sequence; permission?.removeEventListener('change', permissionChanged); },
  };
}
