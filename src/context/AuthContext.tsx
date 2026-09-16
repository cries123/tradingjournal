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
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { isAccountDeleted } from '../services/deletedAccounts';
import { ensureUserProfile } from '../services/userProfile';
import { reportErrorSilently } from '../services/errorReporting';
import { UsernameTakenError, claimUsername as claimUsernameDoc, cacheUsername, clearCachedUsername, fetchUsername, readCachedUsername } from '../services/username';
import { renameUsername as renameUsernameRemote, usernameLoginToken } from '../services/account';
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
    /*
     * Named, because this is the one that has been landing in the error feed as an anonymous
     * "FirebaseError: Missing or insufficient permissions" with nothing but minified SDK frames.
     *
     * It fires on every auth state change and writes users/{uid}. The write loses its permission
     * the instant the session behind it does — signing out with the write still in flight, a
     * token revoked because the account was suspended, a tombstoned account — and a bare `void`
     * turned all of that into an unhandled rejection nobody could trace. Reporting it under a
     * scope means the next one names itself; swallowing it is right because the profile document
     * is bookkeeping the trader never sees, and failing to refresh lastLoginAt must not break a
     * session that is otherwise working.
     */
    void ensureUserProfile(user, false).catch((err: unknown) => {
      reportErrorSilently(err, 'promise', 'profile-sync');
    });
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

      /*
       * The confirmation email, sent once and never waited on.
       *
       * Not a gate on anything. Verification stopped being an anti-abuse measure when the trial
       * moved onto Creem's checkout — a card proves far more than a reachable inbox — so blocking
       * anything on it now would only cost sign-ups. What it still buys is delivery: the
       * trial-ending notes, the failed-payment email and the weekly recap all go to this address,
       * and a typo means silence rather than a bounce anybody notices.
       *
       * Deliberately after the profile write and outside its try: an account exists and the person
       * is signed in by this point, and a mail provider having a bad minute must not surface as a
       * failed sign-up over an account that was created perfectly.
       */
      sendEmailVerification(result.user, { url: `${window.location.origin}/app` }).catch((err) => {
        console.error('[auth] could not send the confirmation email after sign-up:', err);
      });
    },
    [],
  );

  const resetPassword = useCallback(async (email: string) => {
    const auth = getFirebaseAuth();
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  /**
   * Sign in with either an email address or a username.
   *
   * The "@" decides, and an email address takes exactly the path it always did — straight from the
   * browser to Firebase. Only a username detours through /api/username-login, which resolves the
   * handle and hands back a custom token. That asymmetry is deliberate: the server route exists so
   * that a public @handle cannot be turned into the email address behind it, and there is no
   * reason to route a password through it for people who typed their email in the first place.
   */
  const signInWithIdentifier = useCallback(
    async (identifier: string, password: string) => {
      const trimmed = identifier.trim();
      if (trimmed.includes('@')) {
        await signInWithEmail(trimmed, password);
        return;
      }

      const token = await usernameLoginToken(trimmed, password);
      const result = await signInWithCustomToken(getFirebaseAuth(), token);
      await completeSignIn(result.user, false);
    },
    [completeSignIn, signInWithEmail],
  );

  /**
   * Firebase requires a recent sign-in before an email or password change, and "recent" expires.
   *
   * Rather than let the person fill in a form and only then be told to sign in again, every change
   * below takes their current password and re-authenticates first. That is also the security
   * property worth having: someone who walks up to an unlocked laptop cannot change the password
   * without knowing the old one.
   */
  const reauthenticate = useCallback(async (currentPassword: string): Promise<User> => {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (!current?.email) {
      throw new Error('Sign in again before changing your account details.');
    }
    await reauthenticateWithCredential(
      current,
      EmailAuthProvider.credential(current.email, currentPassword),
    );
    return current;
  }, []);

  /**
   * Sends a confirmation link to the NEW address and changes nothing until it is clicked.
   *
   * verifyBeforeUpdateEmail rather than updateEmail: the old call switched the address immediately
   * and would happily move an account onto a mailbox nobody could open — locking the person out of
   * their own password resets. It is also the only one of the two that still works once Firebase's
   * email-enumeration protection is on.
   */
  const changeEmail = useCallback(
    async (newEmail: string, currentPassword: string) => {
      const current = await reauthenticate(currentPassword);
      await verifyBeforeUpdateEmail(current, newEmail.trim(), {
        url: `${window.location.origin}/app`,
      });
    },
    [reauthenticate],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const current = await reauthenticate(currentPassword);
      await updatePassword(current, newPassword);
    },
    [reauthenticate],
  );

  /**
   * Renames through the server, which owns the cooldown and never releases the old handle.
   *
   * The local cache is updated from the server's answer rather than from what was typed, so a name
   * that was normalised on the way through shows the normalised form.
   */
  const renameUsername = useCallback(async (requested: string): Promise<string> => {
    const result = await renameUsernameRemote(requested);
    const uid = getFirebaseAuth().currentUser?.uid;
    if (uid) cacheUsername(uid, result.username);
    setUsername(result.username);
    return result.username;
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
      signInWithIdentifier,
      changeEmail,
      changePassword,
      renameUsername,
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
      signInWithIdentifier,
      changeEmail,
      changePassword,
      renameUsername,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

