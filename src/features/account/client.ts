import { createAuthClient } from 'better-auth/react';
export const authClient = createAuthClient();

export class AccountApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function accountRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin', headers: { Accept: 'application/json', ...init?.headers } });
  const payload = await response.json() as T & { message?: string };
  if (!response.ok) throw new AccountApiError(response.status, payload.message ?? 'Account information couldn’t load.');
  return payload;
}
