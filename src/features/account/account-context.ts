import { createContext } from 'react';
import type { AccountResponse, Preferences } from '../../domain/account';
export type SignOutGuard = (action: () => Promise<void>) => Promise<void>;

export interface AccountState extends AccountResponse {
  loading: boolean; busy: boolean; error: string | null;
  refresh: () => void;
  savePreferences: (preferences: Preferences) => Promise<void>;
  setFavourite: (libraryId: string, save: boolean) => Promise<void>;
  signOut: (onSuccess?: () => void) => Promise<void>;
  registerSignOutGuard: (guard: SignOutGuard) => () => void;
}
export const AccountContext = createContext<AccountState | null>(null);
