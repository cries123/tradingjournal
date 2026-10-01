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
    collection: (path: string) => ({
      limit: () => ({
        get: async () => ({
          docs: trades.map((t) => ({ id: t.id, data: () => t })),
        }),
      }),
      // The ownership lookup: which slugs belong to this uid. Keyed by slug in `owners`, so the
      // id handed back is the slug, exactly as Firestore would.
      where: (field: string, _op: string, value: string) => ({
        get: async () => ({
          docs: Object.entries(owners)
            .filter(([docPath, owner]) => docPath.startsWith(`${path}/`) && owner?.[field as 'uid'] === value)
            .map(([docPath]) => ({ id: docPath.split('/').pop()! })),
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
    await expect(publishTrackRecord('u1', null, { showAmounts: true })).rejects.toThrow(
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
      publishTrackRecord('u1', 'jay', { showAmounts: true }),
    ).rejects.toThrow(/at least 30/);
    expect(writes).toEqual([]);
  });

  it('publishes the record and its ownership row in one commit', async () => {
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));

    const result = await publishTrackRecord('u1', 'Jay', { showAmounts: true });

    expect(result).toEqual({ slug: 'jay', verifiedTrades: 30 });
    expect(committed).toBe(1);
    expect(writes.map((w) => w.path)).toEqual(['trackRecords/jay', 'trackRecordOwners/jay']);
  });

  it('keeps the uid off the public document', async () => {
    // The page is world-readable. An account identifier on it is something the trader never chose
    // to publish, which is why ownership lives in its own collection.
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'jay', { showAmounts: true });

    const record = writes.find((w) => w.path === 'trackRecords/jay')!.data!;
    expect(record.uid).toBeUndefined();
    expect(writes.find((w) => w.path === 'trackRecordOwners/jay')!.data!.uid).toBe('u1');
  });

  it('counts the excluded trades on the page rather than hiding them', async () => {
    trades = [
      ...Array.from({ length: 30 }, (_, i) => imported(i, 10)),
      ...Array.from({ length: 7 }, (_, i) => typed(100 + i, 999)),
    ];
    await publishTrackRecord('u1', 'jay', { showAmounts: true });

    const record = writes.find((w) => w.path === 'trackRecords/jay')!.data!;
    expect(record.verifiedTrades).toBe(30);
    expect(record.excludedTrades).toBe(7);
    // The 7 typed trades are worth $6,993 and contribute nothing to the published P&L.
    expect(record.netPnl).toBe(300);
  });

  it('omits the amounts entirely when the trader asked for rates only', async () => {
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'jay', { showAmounts: false });

    const record = writes.find((w) => w.path === 'trackRecords/jay')!.data!;
    // Absent from the document, not merely flagged: anyone can read this document, so a flag the
    // renderer respects would be privacy theatre.
    expect('netPnl' in record).toBe(false);
    expect('avgWin' in record).toBe(false);
    expect('maxDrawdown' in record).toBe(false);
    expect('bestDay' in record).toBe(false);
    expect(record.winRate).toBeGreaterThan(0);
  });

  it('publishes the handle as typed, while the slug is its lowercased form', async () => {
    /*
     * The username and nothing else.
     *
     * The handle is a name the trader chose and can change, and it is already the address of
     * the page. What must never reach this document is Firebase's displayName, which for a
     * Google sign-in is somebody's legal name — the handler is never given it, so there is
     * nothing here that could start leaking it after a later edit.
     */
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'JayTrades', { showAmounts: true });

    const record = writes.find((w) => w.path === 'trackRecords/jaytrades')!.data!;
    expect(record.username).toBe('JayTrades');
  });

  it('replaces rather than merges, so turning amounts off removes them', async () => {
    trades = Array.from({ length: 30 }, (_, i) => imported(i, 10));
    await publishTrackRecord('u1', 'jay', { showAmounts: false });
    // A merge would leave a previous publish's netPnl readable in the document forever.
    expect(writes[0].kind).toBe('set');
  });
});

describe('publishTrackRecord ownership', () => {
  it('refuses to publish over a record that belongs to another account', async () => {
    /*
     * Unpublishing has always checked ownership and publishing never did, which is the wrong way
     * round — this is the one that overwrites. The registry hands a handle to one account at a
     * time, so the ordinary path cannot collide, but a released or repaired handle would put one
     * trader's figures under another trader's name on a page branded verified.
     */
    trades = Array.from({ length: 40 }, (_, i) => imported(i, 10));
    owners['trackRecordOwners/jay'] = { uid: 'someone-else' };

    await expect(publishTrackRecord('u1', 'jay', { showAmounts: true })).rejects.toThrow(
      /already published/i,
    );
    expect(writes).toEqual([]);
    expect(committed).toBe(0);
  });

  it('republishes over its own record without complaint', async () => {
    trades = Array.from({ length: 40 }, (_, i) => imported(i, 10));
    owners['trackRecordOwners/jay'] = { uid: 'u1' };

    await publishTrackRecord('u1', 'jay', { showAmounts: true });

    expect(writes.some((w) => w.kind === 'set' && w.path === 'trackRecords/jay')).toBe(true);
    expect(writes.some((w) => w.kind === 'delete')).toBe(false);
  });

  it('moves the record when the trader has renamed since publishing', async () => {
    // One trader, one record. Without this the old page stayed online forever under a handle they
    // no longer use.
    trades = Array.from({ length: 40 }, (_, i) => imported(i, 10));
    owners['trackRecordOwners/oldname'] = { uid: 'u1' };

    await publishTrackRecord('u1', 'newname', { showAmounts: true });

    expect(writes).toEqual([
      { kind: 'set', path: 'trackRecords/newname', data: expect.anything() },
      { kind: 'set', path: 'trackRecordOwners/newname', data: expect.anything() },
      { kind: 'delete', path: 'trackRecords/oldname' },
      { kind: 'delete', path: 'trackRecordOwners/oldname' },
    ]);
    expect(committed).toBe(1);
  });

  it('does not touch another account while moving its own', async () => {
    trades = Array.from({ length: 40 }, (_, i) => imported(i, 10));
    owners['trackRecordOwners/oldname'] = { uid: 'u1' };
    owners['trackRecordOwners/stranger'] = { uid: 'u2' };

    await publishTrackRecord('u1', 'newname', { showAmounts: true });

    expect(writes.some((w) => w.path.includes('stranger'))).toBe(false);
  });
});

describe('unpublishTrackRecord', () => {
  it('deletes both documents when the caller owns the slug', async () => {
    owners['trackRecordOwners/jay'] = { uid: 'u1' };

    await unpublishTrackRecord('u1');

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

    await unpublishTrackRecord('u1');

    expect(writes).toEqual([]);
    expect(committed).toBe(0);
  });

  it('does nothing when the caller has nothing published', async () => {
    await unpublishTrackRecord('u1');
    expect(writes).toEqual([]);
    expect(committed).toBe(0);
  });

  it('takes the page down after the trader has renamed', async () => {
    /*
     * The bug this signature change fixes. The slug used to be derived from whatever the trader is
     * called TODAY, so after a rename unpublish looked at a slug with nothing at it, deleted
     * nothing, and reported success — leaving a public record online under the old handle with no
     * button anywhere that could remove it.
     */
    owners['trackRecordOwners/oldname'] = { uid: 'u1' };

    await unpublishTrackRecord('u1');

    expect(writes).toEqual([
      { kind: 'delete', path: 'trackRecords/oldname' },
      { kind: 'delete', path: 'trackRecordOwners/oldname' },
    ]);
  });

  it('clears up more than one if a rename ever left two behind', async () => {
    owners['trackRecordOwners/oldname'] = { uid: 'u1' };
    owners['trackRecordOwners/newname'] = { uid: 'u1' };
    owners['trackRecordOwners/someone'] = { uid: 'u2' };

    await unpublishTrackRecord('u1');

    expect(writes.map((w) => w.path)).toEqual([
      'trackRecords/oldname',
      'trackRecordOwners/oldname',
      'trackRecords/newname',
      'trackRecordOwners/newname',
    ]);
  });
});
