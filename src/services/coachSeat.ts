import type { Trade } from '../types';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

/**
 * The client half of the coach seat.
 *
 * Everything goes through /api/coach-seat rather than Firestore, deliberately — see
 * server/coachSeat.ts for why. The practical consequence here is that there are no live listeners
 * on a coached journal: a coach reloads to see new trades, which is the right trade for a screen
 * somebody opens once a week.
 */

export type SeatState = 'none' | 'pending' | 'active';

export interface SeatSummary {
  state: SeatState;
  coachEmail: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
}

export interface CoachedJournal {
  ownerUid: string;
  username: string | null;
  email: string | null;
  invitedAt: string;
}

export interface CoachNote {
  id: string;
  ownerUid: string;
  coachUid: string;
  coachName: string;
  date: string;
  tradeId?: string;
  body: string;
  createdAt: string;
  unreadForOwner: boolean;
}

export interface CoachedJournalView {
  trades: Trade[];
  since: string;
  notes: CoachNote[];
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  if (!isFirebaseConfigured()) throw new Error('Sign in to use coach seats.');

  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to use coach seats.');

  const token = await user.getIdToken();
  const res = await fetch('/api/coach-seat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

/** The seat on the caller's own journal. */
export function fetchSeat(): Promise<SeatSummary> {
  return post<SeatSummary>({ action: 'seat' });
}

export function inviteCoach(email: string): Promise<{ state: SeatState; coachEmail: string }> {
  return post({ action: 'invite', email });
}

export function revokeCoach(): Promise<{ state: SeatState }> {
  return post({ action: 'revoke' });
}

/** Journals the caller has been invited to coach. */
export function fetchCoaching(): Promise<{ journals: CoachedJournal[] }> {
  return post({ action: 'coaching' });
}

export function fetchCoachedJournal(ownerUid: string): Promise<CoachedJournalView> {
  return post({ action: 'journal', ownerUid });
}

export function postCoachNote(input: {
  ownerUid: string;
  date: string;
  body: string;
  tradeId?: string;
}): Promise<CoachNote> {
  return post({ action: 'note', ...input });
}

/** What the caller's own coach has written on their journal. */
export function fetchMyCoachNotes(): Promise<{ notes: CoachNote[] }> {
  return post({ action: 'notes' });
}

/** Clears the unread badge once the trader has actually looked at the panel. */
export function markCoachNotesRead(): Promise<{ cleared: number }> {
  return post({ action: 'read' });
}
