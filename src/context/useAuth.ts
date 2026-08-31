import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

/**
 * The AuthContext object and its hook, kept apart from the provider that fills it.
 *
 * Splitting them is what lets the provider file hot-reload: a module exporting both a
 * component and plain values is rebuilt wholesale on every edit, losing the state the
 * provider is holding. Everything importing useAuth keeps working unchanged.
 */
export interface AuthContextValue {
  user: User | null;
  username: string | null;
  loading: boolean;
  profileLoading: boolean;
  needsUsername: boolean;
  firebaseEnabled: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string, username: string) => Promise<void>;
  claimUsername: (username: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
