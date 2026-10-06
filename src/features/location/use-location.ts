import { useContext } from 'react';
import { LocationContext } from './location-context';
export function useUserLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error('Location provider is missing.');
  return context;
}
