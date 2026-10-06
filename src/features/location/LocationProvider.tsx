import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Coordinates } from '../../domain/location';
import { LocationContext } from './location-context';
import { locationDisabled, rememberLocationDisabled, requestCoordinates } from './device-location';

export function LocationProvider({ children }: { children: ReactNode }) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const suppressed = useRef(locationDisabled());
  const invalidateRequests = useCallback(() => { ++sequence.current; }, []);
  const clear = useCallback(() => { ++sequence.current; suppressed.current = true; rememberLocationDisabled(undefined, true); setCoordinates(null); setLoading(false); setError(null); }, []);
  const request = useCallback(() => {
    const version = ++sequence.current;
    suppressed.current = false; rememberLocationDisabled(undefined, false); setError(null); setCoordinates(null);
    if (!navigator.geolocation) { setLoading(false); setError('Location isn’t supported here.'); return; }
    setLoading(true);
    void requestCoordinates(navigator.geolocation).then((point) => {
      if (sequence.current === version) setCoordinates(point);
    }).catch((failure: unknown) => {
      if (sequence.current === version) setError(failure instanceof Error ? failure.message : 'Location is unavailable.');
    }).finally(() => { if (sequence.current === version) setLoading(false); });
  }, []);
  useEffect(() => {
    let active = true;
    let permission: PermissionStatus | undefined;
    const changed = () => {
      if (!active) return;
      if (permission?.state === 'granted') { if (!suppressed.current) request(); }
      else { ++sequence.current; setCoordinates(null); setLoading(false); setError(null); }
    };
    // Querying permission never prompts. Only restore an already granted location.
    if (navigator.permissions) void navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (!active) return;
      permission = status; permission.addEventListener('change', changed);
      if (permission.state === 'granted' && !suppressed.current) request();
    }).catch(() => { /* Explicit requests work even without the Permissions API. */ });
    return () => { active = false; invalidateRequests(); permission?.removeEventListener('change', changed); };
  }, [invalidateRequests, request]);
  return <LocationContext value={{ coordinates, loading, error, request, clear }}>{children}</LocationContext>;
}
