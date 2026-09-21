import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Trade } from '../types';

/*
 * The server half of a published record.
 *
 * Two things here are worth a test rather than a careful read:
 *
 * 1. The figures are computed from the account's own trades and the request body is not consulted
 *    for any of them. That is the whole basis of the word "verified" on the public page — a client
 *    able to influence the numbers would make the tick beside them a decoration.
 * 2. Unpublishing deletes somebody's page, and the only thing standing between one account and
 *    another account's slug is the ownership check.
 */

interface WriteOp {
  kind: 'set' | 'delete';
  path: string;
  data?: Record<string, unknown>;
}

let trades: Trade[] = [];
let owners: Record<string, { uid: string } | undefined> = {};
let writes: WriteOp[] = [];
let committed = 0;

const docRef = (path: string) => ({ __path: path });

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      limit: () => ({
        get: async () => ({
          docs: trades.map((t) => ({ id: t.id, data: () => t })),
        }),
      }),
    }),
    doc: (path: string) => ({
      ...docRef(path),
      get: async () => {
        const owner = owners[path];
        return { exists: owner !== undefined, data: () => owner };
      },
    }),
    batch: () => ({
      set: (ref: { __path: string }, data: Record<string, unknown>) => {
        writes.push({ kind: 'set', path: ref.__path, data });
      },
      delete: (ref: { __path: string }) => {
        writes.push({ kind: 'delete', path: ref.__path });
      },
      commit: async () => {
        committed += 1;
      },
    }),
  }),
}));

const { publishTrackRecord, unpublishTrackRecord, TrackRecordError } = await import(
  '../../server/trackRecordHandler'
);

/** A broker-imported trade — sourceId set, which is the only thing that makes one count. */
function imported(i: number, pnl: number): Trade {
  return {
    id: `t${i}`,
    date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
    symbol: 'SPY',
    side: 'long',
    quantity: 1,
    entryPrice: 1,
    exitPrice: 2,
    pnl,
    sourceId: `snaptrade:open${i}:close${i}`,
  } as unknown as Trade;
}

/** Hand-entered: no sourceId, and therefore invisible to everything below. */
function typed(i: number, pnl: number): Trade {
  const t = imported(i, pnl) as unknown as Record<string, unknown>;
  delete t.sourceId;
  return t as unknown as Trade;
}

beforeEach(() => {
  trades = [];
  owners = {};
  writes = [];
  committed = 0;
});

describe('publishTrackRecord', () => {
  it('refuses without a username, because the slug is the username', async () => {
    await expect(publishTrackRecord('u1', null, { showAmounts: true, anonymous: false })).rejects.toThrow(
      TrackRecordError,
    );
    expect(writes).toEqual([]);
  });

  it('refuses below the minimum, counting only broker-imported trades', async () => {
    // 29 imported and 50 typed: comfortably over the floor by total, nowhere near it by the only
    // count that matters. This is the case a laxer rule would wave through.
    trades = [
      ...Array.from({ length: 29 }, (_, i) => imported(i, 10)),
      ...Array.from({ length: 50 }, (_, i) => typed(100 + i, 10)),
    ];
    await expect(
      publishTrackRecord('u1', 'jay', { showAmounts: true, anonymous: false }),
    ).rejects.toThrow(/at least 30/);
    expect(writes).toEqual([]);
  });

  it('publishes the record and its ownership row in one commit', async () => {
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));

    const result = await publishTrackRecord('u1', 'Jay', { showAmounts: true, anonymous: false });

    expect(result).toEqual({ slug: 'jay', verifiedTrades: 30 });
    expect(committed).toBe(1);
    expect(writes.map((w) => w.path)).toEqual(['trackRecords/jay', 'trackRecordOwners/jay']);
  });

  it('keeps the uid off the public document', async () => {
    // The page is world-readable. An account identifier on it is something the trader never chose
    // to publish, which is why ownership lives in its own collection.
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'jay', { showAmounts: true, anonymous: false });

    const record = writes.find((w) => w.path === 'trackRecords/jay')!.data!;
    expect(record.uid).toBeUndefined();
    expect(writes.find((w) => w.path === 'trackRecordOwners/jay')!.data!.uid).toBe('u1');
  });

  it('counts the excluded trades on the page rather than hiding them', async () => {
    trades = [
      ...Array.from({ length: 30 }, (_, i) => imported(i, 10)),
      ...Array.from({ length: 7 }, (_, i) => typed(100 + i, 999)),
    ];
    await publishTrackRecord('u1', 'jay', { showAmounts: true, anonymous: false });

    const record = writes.find((w) => w.path === 'trackRecords/jay')!.data!;
    expect(record.verifiedTrades).toBe(30);
    expect(record.excludedTrades).toBe(7);
    // The 7 typed trades are worth $6,993 and contribute nothing to the published P&L.
    expect(record.netPnl).toBe(300);
  });

  it('omits the amounts entirely when the trader asked for rates only', async () => {
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'jay', { showAmounts: false, anonymous: false });

    const record = writes.find((w) => w.path === 'trackRecords/jay')!.data!;
    // Absent from the document, not merely flagged: anyone can read this document, so a flag the
    // renderer respects would be privacy theatre.
    expect('netPnl' in record).toBe(false);
    expect('avgWin' in record).toBe(false);
    expect('maxDrawdown' in record).toBe(false);
    expect('bestDay' in record).toBe(false);
    expect(record.winRate).toBeGreaterThan(0);
  });

  it('drops the name but keeps the slug when published anonymously', async () => {
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'jay', { showAmounts: true, anonymous: true });

    const record = writes.find((w) => w.path === 'trackRecords/jay')!.data!;
    expect(record.username).toBeNull();
  });

  it('replaces rather than merges, so turning amounts off removes them', async () => {
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'jay', { showAmounts: false, anonymous: false });
    // A merge would leave a previous publish's netPnl readable in the document forever.
    expect(writes[0].kind).toBe('set');
  });
});

describe('unpublishTrackRecord', () => {
  it('deletes both documents when the caller owns the slug', async () => {
    owners['trackRecordOwners/jay'] = { uid: 'u1' };

    await unpublishTrackRecord('u1', 'Jay');

    expect(writes).toEqual([
      { kind: 'delete', path: 'trackRecords/jay' },
      { kind: 'delete', path: 'trackRecordOwners/jay' },
    ]);
    expect(committed).toBe(1);
  });

  it('refuses to delete somebody else’s record', async () => {
    // The one that matters. A username can be renamed and re-registered, so holding the slug is
    // not the same as owning what is published at it.
    owners['trackRecordOwners/jay'] = { uid: 'someone-else' };

    await unpublishTrackRecord('u1', 'jay');

    expect(writes).toEqual([]);
    expect(committed).toBe(0);
  });

  it('does nothing when there is no record at that slug', async () => {
    await unpublishTrackRecord('u1', 'jay');
    expect(writes).toEqual([]);
    expect(committed).toBe(0);
  });

  it('does nothing without a username', async () => {
    await unpublishTrackRecord('u1', null);
    expect(writes).toEqual([]);
  });
});
