import { createContext } from 'react';
import type { Coordinates } from '../../domain/location';

export interface LocationState { coordinates: Coordinates | null; ready: boolean; loading: boolean; error: string | null; request: () => void; clear: () => void }
export const LocationContext = createContext<LocationState | null>(null);
