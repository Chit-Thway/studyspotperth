import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { LocationContext } from './location-context';
import { LOCATION_PREFERENCE_KEYS } from './device-location';
import { createDeviceLocationController, INITIAL_LOCATION_STATE } from './device-location-controller';
import type { Coordinates } from '../../domain/location';

export function LocationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(INITIAL_LOCATION_STATE);
  const [custom, setCustom] = useState<{ coordinates: Coordinates; label: string } | null>(null);
  const controller = useRef<ReturnType<typeof createDeviceLocationController> | null>(null);
  const { key } = useLocation();
  useEffect(() => {
    const location = createDeviceLocationController({ geolocation: navigator.geolocation, permissions: navigator.permissions, onChange: setState });
    controller.current = location;
    void location.start();
    const storageChanged = (event: StorageEvent) => { if (event.key === null || LOCATION_PREFERENCE_KEYS.some((key) => key === event.key)) location.syncPreference(); };
    const visible = () => { if (document.visibilityState === 'visible') location.refresh(); };
    window.addEventListener('storage', storageChanged);
    window.addEventListener('focus', location.refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      location.dispose(); controller.current = null;
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('focus', location.refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  useEffect(() => { controller.current?.refresh(); }, [key]);
  const request = useCallback(() => { setCustom(null); controller.current?.request(); }, []);
  const clear = useCallback(() => { setCustom(null); controller.current?.clear(); }, []);
  const chooseCustom = useCallback((coordinates: Coordinates, label: string) => {
    controller.current?.clear();
    setCustom({ coordinates, label });
  }, []);
  return <LocationContext value={{ ...state, ...(custom ? { coordinates: custom.coordinates, ready: true, loading: false, error: null } : {}),
    label: custom?.label ?? (state.coordinates ? 'Current location' : 'Perth CBD'), isCustom: Boolean(custom), setCustom: chooseCustom, request, clear }}>{children}</LocationContext>;
}
