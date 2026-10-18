import type { BrokerStatus } from './brokerConnect';

/**
 * The last broker status this browser saw, so the connect screen can draw the accounts at once.
 *
 * The live answer is a serverless function asking SnapTrade which accounts a user has: a cold
 * start plus a round trip to their API, four or five seconds on a bad day. The screen drew nothing
 * for that long — a trader who connected Schwab last week opened the screen and saw no Schwab —
 * and then the account appeared, every single visit. The list changes only when the trader
 * connects or disconnects something, both of which happen on this screen, so the previous answer
 * is almost always the current one. It is shown immediately and replaced when the live one lands.
 *
 * Nothing secret is kept: account ids, display names, institutions and authorization ids — the
 * same fields the screen renders. Keyed by user so two people on one browser never see each
 * other's accounts. Two copies: memory for the rest of the session, localStorage for the next one.
 */

const KEY = 'trend-chasers-broker-status';
/** Older than this and the cache is not shown — an account list from months ago is a guess, not a memory. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Cached {
  at: number;
  value: BrokerStatus;
}

const memory = new Map<string, Cached>();

function key(uid: string): string {
  return `${KEY}:${uid}`;
}

function isStatus(v: unknown): v is BrokerStatus {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<BrokerStatus>;
  return typeof s.registered === 'boolean' && Array.isArray(s.accounts);
}

export function readCachedBrokerStatus(uid: string, now = Date.now()): BrokerStatus | null {
  const fresh = (c: Cached | null | undefined) => (c && now - c.at <= MAX_AGE_MS ? c.value : null);
  const inMemory = fresh(memory.get(uid));
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Cached>;
    if (typeof parsed.at !== 'number' || !isStatus(parsed.value)) return null;
    return fresh({ at: parsed.at, value: parsed.value });
  } catch {
    // Private browsing, blocked storage, or a value from an older build. The screen loads live.
    return null;
  }
}

export function writeCachedBrokerStatus(uid: string, value: BrokerStatus, now = Date.now()): void {
  const entry: Cached = { at: now, value };
  memory.set(uid, entry);
  try {
    localStorage.setItem(key(uid), JSON.stringify(entry));
  } catch {
    // Quota or blocked storage: the in-memory copy still covers this session.
  }
}

/** On sign-out, so the next person on this browser starts from nothing. */
export function clearCachedBrokerStatus(uid: string): void {
  memory.delete(uid);
  try {
    localStorage.removeItem(key(uid));
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}
