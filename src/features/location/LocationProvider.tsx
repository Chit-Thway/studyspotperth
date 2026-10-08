import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { LocationContext } from './location-context';
import { LOCATION_PREFERENCE_KEYS } from './device-location';
import { createDeviceLocationController, INITIAL_LOCATION_STATE } from './device-location-controller';

export function LocationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(INITIAL_LOCATION_STATE);
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
  const request = useCallback(() => controller.current?.request(), []);
  const clear = useCallback(() => controller.current?.clear(), []);
  return <LocationContext value={{ ...state, request, clear }}>{children}</LocationContext>;
}
