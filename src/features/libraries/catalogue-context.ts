import { createContext, useContext } from 'react';
import type { PublicCatalogue } from '../../domain/public-catalogue';

export interface CatalogueState { data: PublicCatalogue | null; loading: boolean; error: Error | null; retry: () => void }
export const CatalogueContext = createContext<CatalogueState | null>(null);
export function usePublicCatalogue() {
  const context = useContext(CatalogueContext);
  if (!context) throw new Error('Catalogue provider is missing.');
  return context;
}
