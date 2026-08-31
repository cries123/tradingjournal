import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '../types';

/**
 * These cover one invariant: an anonymous entry must not carry the real username.
 *
 * leaderboardEntries is world-readable so the board can be queried from the client, and the
 * anonymity setting used to be honoured only by the component that rendered the name — the
 * username was written to the document regardless, where anyone could read it. The fix is easy to
 * undo by accident (one spread, one merge flag), and nothing about the UI would look wrong when it
 * broke, so it is pinned here.
 */

const setDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` })),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: (...args: unknown[]) => setDoc(...args),
}));

vi.mock('../lib/firebase', () => ({
  getFirebaseDb: () => ({}),
  isFirebaseConfigured: () => true,
}));

const { upsertLeaderboardEntry, anonLabelForUid } = await import('./leaderboard');

const trades: Trade[] = [
  { id: '1', date: '2026-08-03', symbol: 'SPY', pnl: 120 } as Trade,
  { id: '2', date: '2026-08-04', symbol: 'QQQ', pnl: -40 } as Trade,
];

const writtenEntry = () => setDoc.mock.calls.at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => setDoc.mockClear());

describe('upsertLeaderboardEntry', () => {
  it('omits the username entirely on an anonymous entry', async () => {
    await upsertLeaderboardEntry('uid-1', 'jay_real_name', true, trades);
    const entry = writtenEntry();

    // Absent, not blank: a key present with an empty value still says the field exists, and a
    // blank string is one careless fallback away from being filled back in.
    expect('username' in entry).toBe(false);
    expect(JSON.stringify(entry)).not.toContain('jay_real_name');
  });

  it('keeps the username when the user is not anonymous', async () => {
    await upsertLeaderboardEntry('uid-2', 'jay_real_name', false, trades);
    expect(writtenEntry().username).toBe('jay_real_name');
  });

  it('always writes an anonLabel so the board has something to render', async () => {
    await upsertLeaderboardEntry('uid-3', 'jay_real_name', true, trades);
    expect(writtenEntry().anonLabel).toBe(anonLabelForUid('uid-3'));
  });

  it('overwrites the document rather than merging into it', async () => {
    // This is what makes the fix retroactive: a full setDoc drops a username written by an older
    // build the next time the user syncs. With { merge: true } the stale field would survive
    // forever, and the backfill script would be the only thing that ever removed it.
    await upsertLeaderboardEntry('uid-4', 'jay_real_name', true, trades);
    const options = setDoc.mock.calls.at(-1)?.[2];
    expect(options).toBeUndefined();
  });
});

describe('anonLabelForUid', () => {
  it('is stable for a uid, so a trader keeps the same label across writes', () => {
    expect(anonLabelForUid('uid-1')).toBe(anonLabelForUid('uid-1'));
  });

  it('does not leak the uid it was derived from', () => {
    expect(anonLabelForUid('uid-abcdef123456')).not.toContain('abcdef');
  });
});
