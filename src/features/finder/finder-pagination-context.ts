import { createContext, useContext } from 'react';

interface FinderPaginationMemory {
  lastKey: string | null;
  remember: (key: string) => void;
}
export const FinderPaginationContext = createContext<FinderPaginationMemory | null>(null);
export function useFinderPaginationMemory() {
  const memory = useContext(FinderPaginationContext);
  if (!memory) throw new Error('Finder pagination provider is missing.');
  return memory;
}
