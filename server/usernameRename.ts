import { validateUsername } from '../src/utils/usernameValidation';
import { RENAME_COOLDOWN_DAYS } from '../src/config/accountRules';

/**
 * Whether an account may take a new username right now — the whole rule, as one pure function.
 *
 * Renaming reverses a promise the product made twice ("unique forever" on the signup field,
 * "permanent once claimed" in the setup modal), so the shape of the reversal matters more than the
 * feature. Two decisions are baked in here.
 *
 * THE OLD NAME IS NEVER RELEASED. A rename writes a new usernames/{name} doc and leaves the old
 * one exactly where it is, still pointing at the same uid. Nobody can claim a handle somebody else
 * traded under, which is the only version of this that is safe in a product where @handles appear
 * on share cards: a released handle means a stranger inherits every screenshot, link and mention
 * that ever pointed at it. The cost is one dead document per rename, which is nothing.
 *
 * AND IT IS RATE LIMITED. Thirty days is long enough that a handle somebody saw last week still
 * resolves to the same person, and short enough to fix a name typed wrong at signup. Without a
 * limit, "reserved forever" turns into a way to quietly hoard names one at a time.
 *
 * Pure so the decision can be tested against the clock without a database. The caller supplies who
 * currently owns the requested name; this function never looks anything up.
 */

export { RENAME_COOLDOWN_DAYS };
const DAY_MS = 24 * 60 * 60 * 1000;

export type RenameRefusal = 'invalid' | 'unchanged' | 'taken' | 'too-soon';

export interface RenameRequest {
  /** The account's current username, or null if it somehow has none yet. */
  current: string | null;
  /** ISO timestamp of the last rename, absent for an account that has never renamed. */
  lastChangedAt?: string | null;
  requested: string;
  /**
   * The uid that already owns the requested name, or null when it is free.
   *
   * Their OWN uid is the expected value when they are re-claiming a name they previously retired,
   * which is allowed and is the reason this is a uid rather than a boolean.
   */
  ownerOfRequested: string | null;
  uid: string;
}

export type RenameDecision =
  | { ok: true; normalized: string }
  | { ok: false; reason: RenameRefusal; message: string };

function refuse(reason: RenameRefusal, message: string): Extract<RenameDecision, { ok: false }> {
  return { ok: false, reason, message };
}

/** When the cooldown lifts, or null when there is nothing to wait for. */
export function renameAvailableAt(lastChangedAt: string | null | undefined): string | null {
  if (!lastChangedAt) return null;
  const last = Date.parse(lastChangedAt);
  // An unparseable timestamp must not lock somebody out of their own account forever. Treat a
  // corrupt value as "never renamed" rather than as "renamed at the epoch" or as a hard error.
  if (!Number.isFinite(last)) return null;
  return new Date(last + RENAME_COOLDOWN_DAYS * DAY_MS).toISOString();
}

export function decideRename(request: RenameRequest, now: number): RenameDecision {
  const validation = validateUsername(request.requested);
  if (!validation.ok) return refuse('invalid', validation.error);

  const normalized = validation.normalized;

  /*
   * Checked before the cooldown on purpose: somebody asking for the name they already have gets
   * told that, not told to come back in three weeks. The old code path for this was a no-op write,
   * which reported success and then silently started a fresh cooldown over nothing.
   */
  if (request.current && normalized === request.current) {
    return refuse('unchanged', 'That is already your username.');
  }

  if (request.ownerOfRequested && request.ownerOfRequested !== request.uid) {
    return refuse('taken', 'That username is already taken.');
  }

  const availableAt = renameAvailableAt(request.lastChangedAt);
  if (availableAt && Date.parse(availableAt) > now) {
    const days = Math.max(1, Math.ceil((Date.parse(availableAt) - now) / DAY_MS));
    return refuse(
      'too-soon',
      `You can change your username again in ${days} day${days === 1 ? '' : 's'}.`,
    );
  }

  return { ok: true, normalized };
}
