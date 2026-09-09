import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { effectiveTier, readEntitlement } from './entitlements';
import { tierHas, TIER_PLANS, lowestTierWith } from '../src/config/tiers';
import { usageDay } from './usage';
import type { Trade } from '../src/types';
import {
  checkInvite,
  checkNote,
  coachWindowStart,
  forCoach,
  mayCoach,
  normalizeInvite,
  seatState,
  type CoachNote,
  type CoachSeat,
  type CoachTrade,
} from './coachSeat';

/**
 * Every coach-seat operation, behind one authenticated endpoint.
 *
 * The reason it is all here rather than in Firestore rules is in coachSeat.ts: a rule that lets
 * one account read another's whole trade history when a field somewhere says so is a rule worth
 * being nervous about. Going through a function means the browser never holds cross-account read
 * permission at all — the seat is checked in code, on every call.
 */

export type CoachSeatAction =
  | 'seat'
  | 'invite'
  | 'revoke'
  | 'coaching'
  | 'journal'
  | 'note'
  | 'notes'
  | 'read';

export interface CoachSeatRequest {
  action: CoachSeatAction;
  email?: string;
  ownerUid?: string;
  date?: string;
  tradeId?: string;
  body?: string;
}

export interface CoachSeatResult {
  statusCode: number;
  body: Record<string, unknown>;
}

const db = () => getAdminFirestore();
const seatDoc = (ownerUid: string) => db().doc(`coachSeats/${ownerUid}`);
const notesCol = (ownerUid: string) => db().collection(`coachSeats/${ownerUid}/notes`);

async function readSeat(ownerUid: string): Promise<CoachSeat | null> {
  const snap = await seatDoc(ownerUid).get();
  return snap.exists ? ({ ownerUid, ...snap.data() } as CoachSeat) : null;
}

async function callerEmail(uid: string): Promise<string | null> {
  try {
    return (await getAdminAuth().getUser(uid)).email ?? null;
  } catch {
    return null;
  }
}

/** The uid behind an invited address, or null while that person has no account yet. */
async function uidForEmail(email: string): Promise<string | null> {
  try {
    return (await getAdminAuth().getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

async function assertEntitled(uid: string): Promise<void> {
  const tier = effectiveTier(await readEntitlement(uid), Date.now());
  if (tierHas(tier, 'coachSeat')) return;
  const needed = lowestTierWith('coachSeat');
  throw new BrokerRequestError(
    `Inviting a coach is part of ${needed ? TIER_PLANS[needed].name : 'a paid plan'}.`,
    402,
  );
}

/**
 * The seat this caller coaches, checked before anything is read or written.
 *
 * Entitlement is the OWNER's, never the coach's — a coach on a free account is the entire point,
 * and charging them for the privilege of reading somebody else's journal would be a strange
 * product. What is checked here is only "does this seat name you".
 */
async function assertCoachOf(callerUid: string, ownerUid: string): Promise<CoachSeat> {
  const seat = await readSeat(ownerUid);
  const email = await callerEmail(callerUid);
  if (!mayCoach(seat, { uid: callerUid, email })) {
    // Deliberately the same message and status whether the seat is missing, belongs to somebody
    // else, or the journal does not exist. Distinguishing them turns this into a way to ask
    // whether a given account has a coach.
    throw new BrokerRequestError('You do not have access to that journal.', 403);
  }

  // First call after signing up: bind the seat to the account, so later checks are by uid and the
  // trader stops seeing "invitation pending".
  if (seat && !seat.coachUid) {
    await seatDoc(ownerUid).set(
      { coachUid: callerUid, acceptedAt: new Date().toISOString() },
      { merge: true },
    );
    return { ...seat, coachUid: callerUid };
  }
  return seat!;
}

async function handleSeat(uid: string): Promise<CoachSeatResult> {
  const seat = await readSeat(uid);
  return {
    statusCode: 200,
    body: {
      state: seatState(seat),
      coachEmail: seat?.coachEmail ?? null,
      invitedAt: seat?.invitedAt ?? null,
      acceptedAt: seat?.acceptedAt ?? null,
    },
  };
}

const REFUSALS: Record<string, string> = {
  'bad-email': 'That does not look like an email address.',
  self: 'That is your own address — a coach seat is for somebody else.',
};

async function handleInvite(uid: string, email: string | undefined): Promise<CoachSeatResult> {
  await assertEntitled(uid);

  const decision = checkInvite({
    entitled: true,
    ownerEmail: await callerEmail(uid),
    email: email ?? '',
  });
  if (!decision.ok) {
    throw new BrokerRequestError(REFUSALS[decision.reason] ?? 'That invitation cannot be sent.', 400);
  }

  const coachUid = await uidForEmail(decision.email);
  const now = new Date().toISOString();

  /* Replaces rather than merges any previous seat. One coach at a time is the product, and merging
     would leave the old coach's uid attached to the new address — which is a live seat for
     somebody the trader believes they removed. */
  await seatDoc(uid).set({
    ownerUid: uid,
    coachEmail: decision.email,
    coachUid,
    invitedAt: now,
    acceptedAt: coachUid ? now : null,
  });

  return { statusCode: 200, body: { state: coachUid ? 'active' : 'pending', coachEmail: decision.email } };
}

async function handleRevoke(uid: string): Promise<CoachSeatResult> {
  // The seat goes; the notes stay. They are part of the trader's own journal history, and deleting
  // somebody's coaching record because the coaching ended would be the wrong default by a mile.
  await seatDoc(uid).delete().catch(() => {});
  return { statusCode: 200, body: { state: 'none' } };
}

/** The journals this caller has been invited to coach. */
async function handleCoaching(uid: string): Promise<CoachSeatResult> {
  const email = await callerEmail(uid);
  const seats = new Map<string, CoachSeat>();

  const byUid = await db().collection('coachSeats').where('coachUid', '==', uid).get();
  for (const doc of byUid.docs) seats.set(doc.id, { ownerUid: doc.id, ...doc.data() } as CoachSeat);

  // Invited before they had an account: matched on the address until the first visit binds it.
  if (email) {
    const byEmail = await db()
      .collection('coachSeats')
      .where('coachEmail', '==', normalizeInvite(email))
      .get();
    for (const doc of byEmail.docs) {
      if (!seats.has(doc.id)) seats.set(doc.id, { ownerUid: doc.id, ...doc.data() } as CoachSeat);
    }
  }

  const journals = await Promise.all(
    [...seats.values()].map(async (seat) => {
      // users/{uid} is where the username is written (see services/username.ts), not a profile
      // subdocument — a coach seeing "trader@gmail.com" where a handle should be is the kind of
      // small wrongness that makes a feature feel unfinished.
      const profile = await db().doc(`users/${seat.ownerUid}`).get().catch(() => null);
      const auth = await getAdminAuth().getUser(seat.ownerUid).catch(() => null);
      return {
        ownerUid: seat.ownerUid,
        username: (profile?.data() as { username?: string } | undefined)?.username ?? null,
        email: auth?.email ?? null,
        invitedAt: seat.invitedAt,
      };
    }),
  );

  return { statusCode: 200, body: { journals } };
}

/** The trades a coach may see: a rolling window, stripped of what is not theirs to know. */
async function handleJournal(uid: string, ownerUid: string | undefined): Promise<CoachSeatResult> {
  if (!ownerUid) throw new BrokerRequestError('ownerUid is required', 400);
  await assertCoachOf(uid, ownerUid);

  const since = coachWindowStart(usageDay());
  const snap = await db()
    .collection(`users/${ownerUid}/trades`)
    .where('date', '>=', since)
    .limit(1000)
    .get();

  const trades: CoachTrade[] = snap.docs.map((doc) =>
    forCoach({ ...(doc.data() as Trade), id: doc.id }),
  );

  const notes = await notesCol(ownerUid).orderBy('createdAt', 'desc').limit(200).get();

  return {
    statusCode: 200,
    body: {
      trades,
      since,
      notes: notes.docs.map((d) => ({ id: d.id, ...d.data() })),
    },
  };
}

async function handleNote(uid: string, req: CoachSeatRequest): Promise<CoachSeatResult> {
  if (!req.ownerUid) throw new BrokerRequestError('ownerUid is required', 400);
  if (!req.date) throw new BrokerRequestError('date is required', 400);

  await assertCoachOf(uid, req.ownerUid);

  const checked = checkNote(req.body);
  if (!checked.ok) {
    throw new BrokerRequestError(
      checked.reason === 'empty' ? 'Write something first.' : 'That note is too long.',
      400,
    );
  }

  const auth = await getAdminAuth().getUser(uid).catch(() => null);
  const note: Omit<CoachNote, 'id'> = {
    ownerUid: req.ownerUid,
    coachUid: uid,
    coachName: auth?.displayName || auth?.email || 'Your coach',
    date: req.date,
    ...(req.tradeId ? { tradeId: req.tradeId } : {}),
    body: checked.body,
    createdAt: new Date().toISOString(),
    unreadForOwner: true,
  };

  const ref = await notesCol(req.ownerUid).add(note);
  return { statusCode: 200, body: { id: ref.id, ...note } };
}

/** The owner reading what their coach wrote. */
async function handleNotes(uid: string): Promise<CoachSeatResult> {
  const snap = await notesCol(uid).orderBy('createdAt', 'desc').limit(100).get();
  return {
    statusCode: 200,
    body: { notes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) },
  };
}

/**
 * The owner marking their coach's notes as read.
 *
 * A separate call rather than a side effect of reading them, so opening the journal on a phone in
 * a lift and never seeing the panel does not silently clear the badge. Only unread ones are
 * written, so the common case — nothing new — costs one query and no writes.
 */
async function handleRead(uid: string): Promise<CoachSeatResult> {
  const unread = await notesCol(uid).where('unreadForOwner', '==', true).limit(100).get();
  if (unread.empty) return { statusCode: 200, body: { cleared: 0 } };

  const batch = db().batch();
  for (const doc of unread.docs) batch.update(doc.ref, { unreadForOwner: false });
  await batch.commit();

  return { statusCode: 200, body: { cleared: unread.size } };
}

export async function handleCoachSeatRequest(
  headers: IncomingHttpHeaders,
  body: CoachSeatRequest,
): Promise<CoachSeatResult> {
  try {
    const uid = await assertCallerUid(headers);

    switch (body.action) {
      case 'seat':
        return await handleSeat(uid);
      case 'invite':
        return await handleInvite(uid, body.email);
      case 'revoke':
        return await handleRevoke(uid);
      case 'coaching':
        return await handleCoaching(uid);
      case 'journal':
        return await handleJournal(uid, body.ownerUid);
      case 'note':
        return await handleNote(uid, body);
      case 'notes':
        return await handleNotes(uid);
      case 'read':
        return await handleRead(uid);
      default:
        throw new BrokerRequestError('Unknown action', 400);
    }
  } catch (err) {
    if (err instanceof BrokerRequestError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }
    console.error('[coach-seat] failed:', err);
    return { statusCode: 500, body: { error: 'Coach seat request failed. Please try again.' } };
  }
}
