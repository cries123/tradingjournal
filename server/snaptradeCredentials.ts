import { BrokerRequestError } from './snaptradeAuth';
import { describeHttpError, isRejectedCredential } from './upstreamErrors';

/**
 * A user's SnapTrade identity, and the rules for when it may be replaced.
 *
 * The one rule: a stored secret is only ever overwritten by a secret SnapTrade has just issued. It
 * is never deleted to "make room" for one.
 *
 * It used to be. A rejected call deleted the stored secret first and then asked SnapTrade for a new
 * one, on the theory that the old one was dead anyway. Twice that theory was wrong in a way that
 * cannot be undone. When SnapTrade refused the app's own client id, every call from every user was
 * "rejected", and each one deleted a secret that was perfectly good. And when the user still existed
 * at SnapTrade, the follow-up reset was sent with an empty secret, because the real one had just
 * been deleted — SnapTrade's reset requires the current secret, so it could never work. A user in
 * that state can only be deleted at SnapTrade and connected again from scratch.
 *
 * The SnapTrade and Firestore calls are passed in, so the rule is tested against fakes rather than
 * against a reading of the code (src/services/snaptradeCredentials.test.ts).
 */

export interface SnaptradeCreds {
  userId: string;
  userSecret: string;
}

export interface CredentialDeps {
  /** The stored credentials, or null when this user has never been registered. */
  read: (uid: string) => Promise<SnaptradeCreds | null>;
  write: (uid: string, creds: SnaptradeCreds) => Promise<void>;
  /** registerSnapTradeUser — signed with the app's keys alone. Resolves to the new secret. */
  register: (uid: string) => Promise<string>;
  /** Records a user who needs the admin's Reset broker link. Must not throw. */
  reportResetNeeded: (uid: string, err: Error) => Promise<void>;
}

/**
 * What a user is told when their link can only be fixed by deleting it at SnapTrade.
 *
 * Not "reconnect your broker": reconnecting cannot work while SnapTrade holds a user this app has no
 * working secret for, and telling someone to retry a thing that cannot succeed is how one support
 * thread becomes three. The reset is one button in the admin panel, and the report beside this
 * error puts the account in the Errors list so it gets pressed.
 */
export const RESET_NEEDED_MESSAGE =
  'Your broker link needs a reset on our side before it can connect again. Contact support and we’ll reset it — your trades are not affected.';

/**
 * True when SnapTrade says this user id is already registered.
 *
 * Reads the response body, not just the message. The SDK's message is "Request failed with status
 * code 400" followed by the response headers; "already exist" is only ever in the body, so the
 * message-only check this replaced could not have matched a real SnapTrade answer.
 */
export function isAlreadyRegistered(err: unknown): boolean {
  const { status, body } = describeHttpError(err);
  if (status !== 400 && status !== 409) return false;
  const text = `${body} ${err instanceof Error ? err.message.split('\n')[0] : ''}`.toLowerCase();
  return text.includes('already') || text.includes('exist') || text.includes('registered');
}

/**
 * Asks SnapTrade for a new user and stores the secret it issues.
 *
 * Nothing is written unless registration succeeds. When the user already exists there, there is
 * no secret to be had — reset needs the current one — so the account is reported for a reset and
 * the stored row, working or not, is left exactly as it was.
 */
async function registerFresh(uid: string, deps: CredentialDeps): Promise<SnaptradeCreds> {
  let userSecret: string;
  try {
    userSecret = await deps.register(uid);
  } catch (err) {
    // Anything other than "already exists" — including the app's own keys being refused — is not
    // this user's problem and is not answered by touching their row. The caller reports it.
    if (!isAlreadyRegistered(err)) throw err;

    await deps.reportResetNeeded(
      uid,
      new Error(
        'SnapTrade has this user but will not accept the stored secret, and cannot issue a new one without it. Use Reset broker link on this account, then they reconnect.',
      ),
    );
    throw new BrokerRequestError(RESET_NEEDED_MESSAGE, 409);
  }

  const creds: SnaptradeCreds = { userId: uid, userSecret };
  await deps.write(uid, creds);
  return creds;
}

/** The stored credentials, registering the user first if there are none. */
export async function getOrRegisterCreds(uid: string, deps: CredentialDeps): Promise<SnaptradeCreds> {
  const existing = await deps.read(uid);
  if (existing?.userSecret) return existing;
  return registerFresh(uid, deps);
}

/**
 * Runs an authenticated SnapTrade call, and treats a rejected secret as recoverable exactly once.
 *
 * Recovery is registration. It works for the case it exists for — the user is unknown to this
 * SnapTrade environment, so registering mints a working secret — and does NOT restore brokerage
 * authorizations, which live in the environment the connection was made against. So a successful
 * retry still means "you are known to us again, now reconnect your broker", and the caller surfaces
 * that rather than pretending the sync worked.
 *
 * A refusal of the app's own keys is not a rejected secret (isRejectedCredential says no) and is
 * rethrown untouched.
 */
export async function withCredentialRecovery<T>(
  uid: string,
  creds: SnaptradeCreds,
  call: (creds: SnaptradeCreds) => Promise<T>,
  deps: CredentialDeps,
): Promise<T> {
  try {
    return await call(creds);
  } catch (err) {
    if (!isRejectedCredential(err)) throw err;

    console.warn(`[broker-connect] stored secret for ${uid} was rejected — trying to register again.`);
    const fresh = await registerFresh(uid, deps);

    try {
      return await call(fresh);
    } catch (retryErr) {
      if (!isRejectedCredential(retryErr)) throw retryErr;
      // The new secret is valid; what is missing is the brokerage connection itself. Say that,
      // rather than handing the user a SnapTrade signature error to interpret.
      throw new BrokerRequestError(
        'Your broker connection needs to be set up again. Open Connect Broker and reconnect your account.',
        409,
      );
    }
  }
}
