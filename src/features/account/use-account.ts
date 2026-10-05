import { useContext } from 'react';
import { AccountContext } from './account-context';
export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error('AccountProvider is required.');
  return account;
}
