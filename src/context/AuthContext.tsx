import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { isAccountDeleted } from '../services/deletedAccounts';
import { ensureUserProfile } from '../services/userProfile';
import { UsernameTakenError, claimUsername as claimUsernameDoc, cacheUsername, clearCachedUsername, fetchUsername, readCachedUsername } from '../services/username';
import { validateUsername } from '../utils/usernameValidation';

interface AuthContextValue {
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

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadUsername(uid: string): Promise<string | null> {
  const auth = getFirebaseAuth();
  try {
    await auth.currentUser?.getIdToken();
  } catch {
    // continue — Firestore may still work with cached token
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const name = await fetchUsername(uid);
      if (name) {
        cacheUsername(uid, name);
        return name;
      }
    } catch {
      if (attempt === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured());
  const [profileLoading, setProfileLoading] = useState(false);
  const previousUidRef = useRef<string | null>(null);

  const firebaseEnabled = isFirebaseConfigured();

  useEffect(() => {
    if (!firebaseEnabled) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      void (async () => {
        try {
          if (await isAccountDeleted(nextUser.uid)) {
            await signOut(auth);
            setUser(null);
            return;
          }
        } catch {
          // If the check fails, still allow session — don't lock out on network blips.
        }
        setUser(nextUser);
      })().finally(() => {
        setLoading(false);
      });
    });
  }, [firebaseEnabled]);

  useEffect(() => {
    if (!user || !firebaseEnabled) {
      setUsername(null);
      previousUidRef.current = null;
      setProfileLoading(false);
      return;
    }

    const switchedAccount =
      previousUidRef.current !== null && previousUidRef.current !== user.uid;
    previousUidRef.current = user.uid;

    const cached = readCachedUsername(user.uid);
    if (cached) {
      setUsername(cached);
    } else if (switchedAccount) {
      setUsername(null);
    }

    let cancelled = false;
    setProfileLoading(true);
    void loadUsername(user.uid)
      .then((name) => {
        if (!cancelled) {
          setUsername((prev) => name ?? prev);
        }
      })
      .catch(() => {
        if (!cancelled) setUsername((prev) => prev ?? cached);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, firebaseEnabled]);

  const claimUsername = useCallback(
    async (rawUsername: string) => {
      if (!user) throw new Error('Not signed in');
      const validation = validateUsername(rawUsername);
      if (!validation.ok) throw new Error(validation.error);
      const claimed = await claimUsernameDoc(user.uid, validation.normalized);
      setUsername(claimed);
    },
    [user],
  );

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    if (await isAccountDeleted(result.user.uid)) {
      await signOut(auth);
      throw new Error('This account has been removed.');
    }
    const isNew =
      result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
    await ensureUserProfile(result.user, isNew);
    const name = await loadUsername(result.user.uid);
    if (name) setUsername(name);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (await isAccountDeleted(result.user.uid)) {
      await signOut(auth);
      throw new Error('This account has been removed.');
    }
    await ensureUserProfile(result.user, false);
    const name = await loadUsername(result.user.uid);
    if (name) setUsername(name);
  }, []);

  const createAccount = useCallback(
    async (email: string, password: string, rawUsername: string) => {
      const validation = validateUsername(rawUsername);
      if (!validation.ok) throw new Error(validation.error);

      const auth = getFirebaseAuth();
      const result = await createUserWithEmailAndPassword(auth, email, password);

      try {
        const claimed = await claimUsernameDoc(result.user.uid, validation.normalized);
        setUsername(claimed);
        await ensureUserProfile(result.user, true);
      } catch (err) {
        if (err instanceof UsernameTakenError) {
          throw err;
        }
        throw err;
      }
    },
    [],
  );

  const resetPassword = useCallback(async (email: string) => {
    const auth = getFirebaseAuth();
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    await signOut(auth);
    if (uid) clearCachedUsername(uid);
    setUsername(null);
  }, []);

  const needsUsername = firebaseEnabled && Boolean(user) && !profileLoading && !username;

  const value = useMemo(
    () => ({
      user,
      username,
      loading,
      profileLoading,
      needsUsername,
      firebaseEnabled,
      signInWithGoogle,
      signInWithEmail,
      createAccount,
      claimUsername,
      resetPassword,
      logout,
    }),
    [
      user,
      username,
      loading,
      profileLoading,
      needsUsername,
      firebaseEnabled,
      signInWithGoogle,
      signInWithEmail,
      createAccount,
      claimUsername,
      resetPassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
