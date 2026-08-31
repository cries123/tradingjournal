import { AuthContext } from './useAuth';
import {
  useCallback,
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
    // `loading` already initializes to `isFirebaseConfigured()`, so it's already
    // false here when Firebase isn't configured — nothing to set.
    if (!firebaseEnabled) return;

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
    if (!user || !firebaseEnabled) return;
    void ensureUserProfile(user, false);
  }, [user, firebaseEnabled]);

  useEffect(() => {
    if (!user || !firebaseEnabled) {
      // Clearing state before the fetch or subscription below. This is the external-system sync
      // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
      // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
      // rule rather than to fix a bug.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  /**
   * Everything that happens after the credential is accepted.
   *
   * Split out and made non-fatal because it is *not* authentication. Once Firebase has accepted
   * the credential the person is signed in — the auth state has already changed and the app will
   * proceed. If a Firestore read then fails (a blocked rule, a network blip, an exhausted read
   * quota — all of which this project has actually seen), letting it throw meant the sign-in
   * screen announced "Authentication failed" over a session that had authenticated perfectly.
   * That is the wrong message, and it made a working Google sign-in look broken.
   *
   * The onAuthStateChanged listener above already guards the same call for the same reason. These
   * two direct paths were simply never given the same treatment.
   *
   * The deleted-account check is the one exception that must still stop the session: it is a real
   * authorisation decision, not bookkeeping. But it only signs the user out when the document says
   * so — never when the lookup itself failed.
   */
  const completeSignIn = useCallback(async (user: User, isNew: boolean) => {
    const auth = getFirebaseAuth();

    let deleted = false;
    try {
      deleted = await isAccountDeleted(user.uid);
    } catch {
      // Unreadable means unknown, and unknown is not grounds for refusing someone their account.
      // The same check runs again on every auth state change, so a genuinely deleted account is
      // caught the moment the lookup works.
    }
    if (deleted) {
      await signOut(auth);
      throw new Error('This account has been removed.');
    }

    try {
      await ensureUserProfile(user, isNew);
    } catch (err) {
      // A profile document that failed to write is worth knowing about, but it is not a reason to
      // tell someone their sign-in failed when it did not.
      console.error('[auth] could not write the user profile after sign-in:', err);
    }

    const name = await loadUsername(user.uid);
    if (name) setUsername(name);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const isNew = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
    await completeSignIn(result.user, isNew);
  }, [completeSignIn]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const auth = getFirebaseAuth();
      const result = await signInWithEmailAndPassword(auth, email, password);
      await completeSignIn(result.user, false);
    },
    [completeSignIn],
  );

  const createAccount = useCallback(
    async (email: string, password: string, rawUsername: string) => {
      const validation = validateUsername(rawUsername);
      if (!validation.ok) throw new Error(validation.error);

      const auth = getFirebaseAuth();
      const result = await createUserWithEmailAndPassword(auth, email, password);

      /*
       * Past this line the account EXISTS and the person is signed in. Everything below is
       * bookkeeping, and the old code let all of it throw into the sign-up form's catch — which
       * printed "Authentication failed. Please try again." over an account that had just been
       * created successfully. Retrying then produced "An account with this email already exists",
       * so the dead end was complete: told it failed, then told it already worked.
       *
       * (The previous try/catch here was also a no-op — both branches were `throw err`.)
       */
      try {
        const claimed = await claimUsernameDoc(result.user.uid, validation.normalized);
        setUsername(claimed);
      } catch (err) {
        // A taken username is a real, actionable answer and must reach the form. Anything else is
        // infrastructure: the account is fine, and `needsUsername` will prompt for a name on the
        // next load rather than stranding them here.
        if (err instanceof UsernameTakenError) throw err;
        console.error('[auth] could not claim the username after sign-up:', err);
      }

      try {
        await ensureUserProfile(result.user, true);
      } catch (err) {
        console.error('[auth] could not write the user profile after sign-up:', err);
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

