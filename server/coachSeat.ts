import type { Trade } from '../src/types';

/**
 * The coach seat: one invited person who can read a journal and write on it.
 *
 * Every tier can already hand out a read-only snapshot link. What that link cannot do is let the
 * coach answer — and a review nobody can reply to is a screenshot, which is what traders were
 * already sending by hand. This is the reply half, and it is the piece of Diamond that costs
 * nothing to run and brings a second person into the product.
 *
 * The whole thing is server-mediated rather than done with Firestore rules, and that is the main
 * design decision here. Rules *could* be written to let one user read another's trades by looking
 * up a seat document, but "one account can read another account's entire trade history if a field
 * somewhere says so" is a sentence worth being nervous about, and a rule that subtle is one edit
 * away from being wrong for everybody. Going through a function means the client never holds
 * cross-account read permission at all: the seat is checked in one place, on every call, in code
 * that can be tested.
 *
 * The pure parts live here so that "who may see what" can be tested without a database.
 */

export type SeatState = 'none' | 'pending' | 'active';

export interface CoachSeat {
  ownerUid: string;
  /** Lowercased, as invited. Kept even once accepted, so the owner sees who they invited. */
  coachEmail: string;
  /** Set once the invited email has been matched to a real account. */
  coachUid: string | null;
  invitedAt: string;
  acceptedAt: string | null;
}

/** Notes a coach leaves. Anchored to a day, or to one trade within it. */
export interface CoachNote {
  id: string;
  ownerUid: string;
  coachUid: string;
  coachName: string;
  /** YYYY-MM-DD the note is about. */
  date: string;
  /** Set when the note is about one trade rather than the whole day. */
  tradeId?: string;
  body: string;
  createdAt: string;
  /** Cleared when the owner opens the day. Drives the unread badge. */
  unreadForOwner: boolean;
}

/** Longest a single note may be. Long enough for a real review, short enough to stay a note. */
export const MAX_NOTE_LENGTH = 2000;

/** How much of the journal a coach is shown. A coach reviews recent trading, not a tax history. */
export const COACH_WINDOW_DAYS = 90;

export function seatState(seat: CoachSeat | null): SeatState {
  if (!seat) return 'none';
  return seat.coachUid ? 'active' : 'pending';
}

/**
 * The one normalisation this does, and why it is the only one.
 *
 * Lowercasing and trimming is what makes "Coach@Example.com " match the account that signed up as
 * "coach@example.com". Nothing further — no dot-stripping, no plus-alias folding. Those tricks
 * belong to abuse prevention, where treating two addresses as the same person is the point; here
 * the same move would silently hand one person's journal to a different mailbox than the trader
 * typed, which is the opposite of what an invitation is for.
 */
export function normalizeInvite(email: string): string {
  return email.trim().toLowerCase();
}

/** A plausible email, checked well enough to reject a typo rather than to validate an RFC. */
export function isInvitableEmail(email: string): boolean {
  const value = normalizeInvite(email);
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export type InviteRefusal = 'not-entitled' | 'bad-email' | 'self';

/**
 * Whether this invitation may be sent.
 *
 * Inviting yourself is refused rather than ignored. It does nothing harmful — you can already read
 * your own journal — but it silently produces a seat that looks active and never delivers a
 * coach, and the trader is left wondering why nothing happened.
 */
export function checkInvite(input: {
  entitled: boolean;
  ownerEmail: string | null;
  email: string;
}): { ok: true; email: string } | { ok: false; reason: InviteRefusal } {
  if (!input.entitled) return { ok: false, reason: 'not-entitled' };
  if (!isInvitableEmail(input.email)) return { ok: false, reason: 'bad-email' };

  const email = normalizeInvite(input.email);
  if (input.ownerEmail && normalizeInvite(input.ownerEmail) === email) {
    return { ok: false, reason: 'self' };
  }
  return { ok: true, email };
}

/**
 * Whether this caller may act as coach on this journal.
 *
 * Matched on uid once accepted, and on email before that — which is what lets a coach who was
 * invited before they had an account sign up and find the journal waiting, without the trader
 * having to invite them a second time.
 */
export function mayCoach(
  seat: CoachSeat | null,
  caller: { uid: string; email: string | null },
): boolean {
  if (!seat) return false;
  if (seat.coachUid) return seat.coachUid === caller.uid;
  return Boolean(caller.email) && normalizeInvite(caller.email!) === seat.coachEmail;
}

/** A note as submitted, or a reason it is not one. */
export function checkNote(body: unknown): { ok: true; body: string } | { ok: false; reason: 'empty' | 'too-long' } {
  if (typeof body !== 'string') return { ok: false, reason: 'empty' };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_NOTE_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, body: trimmed };
}

/** The earliest day a coach may see, as YYYY-MM-DD. */
export function coachWindowStart(today: string, days = COACH_WINDOW_DAYS): string {
  const at = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return today;
  return new Date(at - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The trade a coach is allowed to see, with the parts that are none of their business removed.
 *
 * Same list the snapshot share already strips, and for the same reasons: which journal a trade
 * sits in and which broker row it came from say something about the trader's accounts rather than
 * their trading. Written notes stay — a coach who cannot read why the trade was taken is being
 * asked to review a spreadsheet.
 */
export type CoachTrade = Omit<Trade, 'accountId' | 'accountType' | 'sourceId' | 'strategyId' | 'savedAt'>;

export function forCoach(trade: Trade): CoachTrade {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop these */
  const { accountId, accountType, sourceId, strategyId, savedAt, ...rest } = trade;
  return rest;
}
