import { useState, type ReactNode } from 'react';
import { FinderPaginationContext } from './finder-pagination-context';

/** Per-tab memory survives detail/profile navigation, never URLs or storage. */
export function FinderPaginationProvider({ children }: { children: ReactNode }) {
  const [lastKey, remember] = useState<string | null>(null);
  return <FinderPaginationContext value={{ lastKey, remember }}>{children}</FinderPaginationContext>;
}
