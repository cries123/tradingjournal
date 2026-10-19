import { getAdminFirestore } from './firebaseAdmin';

/**
 * What each Creem webhook was, and what became of it.
 *
 * The webhook handler already writes `creemEvents/{id}` as its seen-marker, with nothing in it but
 * a timestamp. Creem's events decide who is on what plan, and the panel has a "Missing membership"
 * ticket category because that goes wrong — and when it did, nobody could see what Creem had sent
 * or what the handler made of it. The marker now carries the event's type, the uid and tier it
 * resolved to, the outcome, and the payload itself, so a stuck plan can be read and replayed from
 * the Ops tab.
 *
 * Never throws: the record is a note about the event, and a failure to write it must not make
 * Creem retry a billing change that has already landed.
 */
export const CREEM_EVENTS = 'creemEvents';

export type BillingEventOutcome = 'applied' | 'skipped' | 'ignored' | 'failed' | 'replayed';

export interface BillingEventRecord {
  id?: string;
  receivedAt: string;
  eventType: string | null;
  uid: string | null;
  tier: string | null;
  status: string | null;
  trialing: boolean;
  outcome: BillingEventOutcome | null;
  /** The handler's own reason when it did not apply — "admin grant", "stale", and so on. */
  reason: string | null;
  /** The event as Creem sent it, for reading and for replay. */
  payload: string | null;
  replays: number;
  lastReplayAt: string | null;
}

/** Keeps a payload readable in the panel and under Firestore's document limit with room to spare. */
const MAX_PAYLOAD_CHARS = 60_000;

export async function noteBillingEvent(
  eventId: string,
  patch: Partial<Omit<BillingEventRecord, 'id' | 'receivedAt'>> & { rawPayload?: string },
): Promise<void> {
  if (!eventId) return;
  try {
    const { rawPayload, ...rest } = patch;
    await getAdminFirestore()
      .doc(`${CREEM_EVENTS}/${eventId}`)
      .set({ ...rest, ...(rawPayload !== undefined ? { payload: rawPayload.slice(0, MAX_PAYLOAD_CHARS) } : {}) }, { merge: true });
  } catch (err) {
    console.error(`[creem-events] could not record the outcome of ${eventId}:`, err);
  }
}

export async function readBillingEvent(eventId: string): Promise<BillingEventRecord | null> {
  const snap = await getAdminFirestore().doc(`${CREEM_EVENTS}/${eventId}`).get();
  return snap.exists ? { ...(snap.data() as BillingEventRecord), id: snap.id } : null;
}

/** The most recent events, newest first. Payloads left out: the list is a list, not a dump. */
export async function readRecentBillingEvents(max = 50): Promise<BillingEventRecord[]> {
  const snap = await getAdminFirestore().collection(CREEM_EVENTS).orderBy('receivedAt', 'desc').limit(max).get();
  return snap.docs.map((d) => {
    const data = d.data() as BillingEventRecord;
    return {
      id: d.id,
      receivedAt: data.receivedAt,
      eventType: data.eventType ?? null,
      uid: data.uid ?? null,
      tier: data.tier ?? null,
      status: data.status ?? null,
      trialing: data.trialing ?? false,
      outcome: data.outcome ?? null,
      reason: data.reason ?? null,
      payload: data.payload ? 'stored' : null,
      replays: data.replays ?? 0,
      lastReplayAt: data.lastReplayAt ?? null,
    };
  });
}
