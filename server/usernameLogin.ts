import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { normalizeUsername, validateUsername } from '../src/utils/usernameValidation';

/**
 * Signing in with a username instead of an email address.
 *
 * Firebase Auth only knows email and password, so something has to turn a handle into an account.
 * The obvious way — an endpoint that returns the email for a username, which the client then signs
 * in with — is the one thing this must not do: @handles are public in this product, they are
 * printed on share cards, so an endpoint like that is a machine for turning every public handle
 * into the address behind it. Spam and password-reset phishing both start there.
 *
 * So the exchange happens here instead. This function takes the password, checks it against
 * Firebase's own sign-in endpoint server-side, and returns a CUSTOM TOKEN. The email never leaves
 * the server, and a wrong username and a wrong password produce the same answer, so the endpoint
 * cannot be used to find out which handles exist either.
 *
 * The trade being made, stated plainly: the password passes through this function, where signing
 * in with an email address does not. That is why the email path in the client stays exactly as it
 * was and only username logins come through here — the common case keeps the shorter route. The
 * password is never logged and never stored, and it goes straight to Google over TLS.
 *
 * The throttle is not optional. Firebase rate-limits signInWithPassword per calling IP, and every
 * call from here carries Netlify's IP rather than the visitor's — so that protection is not merely
 * weakened, it is pointed at us: an attacker guessing passwords through this endpoint would get
 * the whole function rate-limited rather than themselves. The counter below replaces it.
 */

export const MAX_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export class LoginError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'LoginError';
    this.statusCode = statusCode;
  }
}

/**
 * One message for every failure.
 *
 * Wrong handle, wrong password, no password on the account, throttled — all the same sentence.
 * Anything more specific is an oracle for which handles exist and which have passwords.
 */
export const REFUSAL = 'Wrong username or password.';

export interface AttemptRecord {
  count?: number;
  windowStartedAt?: string;
}

export interface AttemptState {
  blocked: boolean;
  count: number;
  windowStartedAt: string;
}

/** The counter after one more attempt, and whether this one should be refused outright. */
export function nextAttemptState(record: AttemptRecord | null, now: number): AttemptState {
  const startedAt = record?.windowStartedAt ? Date.parse(record.windowStartedAt) : NaN;
  const withinWindow = Number.isFinite(startedAt) && now - startedAt < ATTEMPT_WINDOW_MS;

  if (!withinWindow) {
    return { blocked: false, count: 1, windowStartedAt: new Date(now).toISOString() };
  }

  const count = (typeof record?.count === 'number' && Number.isFinite(record.count) ? record.count : 0) + 1;
  return {
    blocked: count > MAX_ATTEMPTS,
    count,
    windowStartedAt: new Date(startedAt).toISOString(),
  };
}

function webApiKey(): string {
  /*
   * The browser-facing Firebase key, which is public by design — it is compiled into the bundle
   * and visible in every request the app makes. Netlify exposes build variables to functions too,
   * so VITE_FIREBASE_API_KEY usually answers here with nothing new to configure; the unprefixed
   * name is checked first so it can be set explicitly if that ever stops being true.
   */
  const key = process.env.FIREBASE_WEB_API_KEY ?? process.env.VITE_FIREBASE_API_KEY;
  if (!key) {
    throw new LoginError('Username sign-in is not configured on the server.', 503);
  }
  return key;
}

/** Verifies a password against Firebase without signing anybody in here. */
async function passwordIsCorrect(email: string, password: string): Promise<boolean> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webApiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // returnSecureToken:false — the tokens Firebase would mint here are not the ones the client
      // ends up using, and asking for them only creates a session nobody closes.
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    },
  );

  if (res.ok) return true;

  // 400 is Firebase's answer for every bad-credential case. Anything else is Firebase itself
  // having a problem, and reporting that as "wrong password" would send people to reset a
  // password that was correct.
  if (res.status === 400) return false;
  console.error('[username-login] identitytoolkit returned', res.status);
  throw new LoginError('Could not sign you in right now. Try again shortly.', 502);
}

export interface UsernameLoginResult {
  /** Exchanged for a session by the client with signInWithCustomToken. */
  token: string;
}

export async function signInWithUsername(
  rawUsername: string,
  password: string,
): Promise<UsernameLoginResult> {
  const normalized = normalizeUsername(rawUsername);

  // A handle that could never have been registered is refused without touching the database or
  // Firebase, which also keeps junk out of the attempt counter.
  if (!validateUsername(normalized).ok || !password) {
    throw new LoginError(REFUSAL, 401);
  }

  const db = getAdminFirestore();
  const attemptRef = db.doc(`loginAttempts/${normalized}`);

  const attemptSnap = await attemptRef.get();
  const attempt = nextAttemptState((attemptSnap.data() as AttemptRecord) ?? null, Date.now());
  await attemptRef.set({ count: attempt.count, windowStartedAt: attempt.windowStartedAt });

  if (attempt.blocked) {
    throw new LoginError(REFUSAL, 429);
  }

  const usernameSnap = await db.doc(`usernames/${normalized}`).get();
  const uid = (usernameSnap.data() as { uid?: string } | undefined)?.uid;
  if (!uid) throw new LoginError(REFUSAL, 401);

  const auth = getAdminAuth();
  const record = await auth.getUser(uid).catch(() => null);
  if (!record?.email) throw new LoginError(REFUSAL, 401);

  if (!(await passwordIsCorrect(record.email, password))) {
    throw new LoginError(REFUSAL, 401);
  }

  // Correct password: the window is cleared so a person who mistyped twice and then got it right
  // does not carry those attempts into their next sign-in.
  await attemptRef.delete().catch(() => {});

  return { token: await auth.createCustomToken(uid) };
}
