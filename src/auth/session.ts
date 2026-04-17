import { saveAuth, clearAuth, type StoredAuth } from "./store.ts";

export interface SessionState {
  email: string;
  idToken: string;
  refreshToken: string;
  obtainedAt: number;
}

let current: SessionState | null = null;

export function getSession(): SessionState | null {
  return current;
}

export function hydrateSession(auth: StoredAuth): void {
  current = { ...auth };
}

export function setTokens(tokens: { idToken: string; refreshToken: string }): void {
  if (!current) return;
  current = {
    ...current,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    obtainedAt: Date.now(),
  };
  void saveAuth(current);
}

export function setSession(email: string, tokens: { idToken: string; refreshToken: string }): void {
  current = {
    email,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    obtainedAt: Date.now(),
  };
  void saveAuth(current);
}

export function clearSession(): void {
  current = null;
  void clearAuth();
}
