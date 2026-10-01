import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Who gets through the coach-seat door.
 *
 * A seat that has not been accepted yet is matched by EMAIL ADDRESS — which is what lets somebody
 * invited before they had an account sign up and find the journal waiting. The address was taken
 * straight off the Auth record with no check that anyone had proved they could read it.
 *
 * Firebase only prevents a SECOND account on an address, so between the invitation being sent and
 * the real coach signing up, that address is unclaimed. Whoever registers it first — with no
 * confirmation link ever opened — got the trader's entire journal and a writable coaching thread.
 * The trial rule already refuses an unverified address for a far smaller prize, in those words:
 * "an address nobody has proved they can read is not an identity — it is a string somebody typed".
 *
 * These drive the real handler, because the hole was not in mayCoach — which is pure, tested, and
 * correct — but in what the handler chose to hand it.
 */

interface FakeUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string;
}

let users: Record<string, FakeUser> = {};
let seats: Record<string, Record<string, unknown>> = {};
let callerUid = 'coach-uid';
/** Trades the owner holds, for the journal read. */
let ownerTrades: Record<string, unknown>[] = [];

vi.mock('../../server/snaptradeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../server/snaptradeAuth')>(
    '../../server/snaptradeAuth',
  );
  return { ...actual, assertCallerUid: async () => callerUid };
});

vi.mock('../../server/entitlements', () => ({
  // The OWNER's entitlement is what gates inviting; every owner here is on Diamond.
  readEntitlement: async () => ({ tier: 'diamond', source: 'purchase', status: 'active' }),
  effectiveTier: () => 'diamond',
}));

const docFor = (path: string) => ({
  get: async () => {
    const data = path.startsWith('coachSeats/') ? seats[path.split('/')[1]!] : undefined;
    return { exists: data !== undefined, data: () => data, id: path.split('/').pop() };
  },
  set: async (value: Record<string, unknown>, options?: { merge?: boolean }) => {
    const id = path.split('/')[1]!;
    seats[id] = options?.merge ? { ...(seats[id] ?? {}), ...value } : value;
  },
  delete: async () => {
    delete seats[path.split('/')[1]!];
  },
});

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminAuth: () => ({
    getUser: async (uid: string) => {
      const user = users[uid];
      if (!user) throw new Error('no such user');
      return user;
    },
    getUserByEmail: async (email: string) => {
      const match = Object.values(users).find((u) => u.email === email);
      if (!match) throw new Error('no such user');
      return match;
    },
  }),
  getAdminFirestore: () => ({
    doc: (path: string) => docFor(path),
    collection: () => ({
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: Object.entries(seats)
            .filter(([, seat]) => seat[field] === value)
            .map(([id, seat]) => ({ id, data: () => seat })),
          empty: false,
        }),
        orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [], empty: true }) }) }),
        limit: () => ({ get: async () => ({ docs: [], empty: true }) }),
      }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [], empty: true }) }) }),
      limit: () => ({
        get: async () => ({
          docs: ownerTrades.map((t, i) => ({ id: `t${i}`, data: () => t })),
          empty: ownerTrades.length === 0,
        }),
      }),
      add: async () => ({ id: 'note-1' }),
      get: async () => ({ docs: [], empty: true }),
    }),
    batch: () => ({ update: () => {}, commit: async () => {} }),
  }),
}));

const { handleCoachSeatRequest } = await import('../../server/coachSeatHandler');

beforeEach(() => {
  users = {
    'owner-uid': { uid: 'owner-uid', email: 'trader@example.com', emailVerified: true },
    'coach-uid': { uid: 'coach-uid', email: 'coach@example.com', emailVerified: true },
    'impostor-uid': { uid: 'impostor-uid', email: 'coach@example.com', emailVerified: false },
  };
  seats = {
    // Invited, never accepted: the state where the address is the only key.
    'owner-uid': {
      ownerUid: 'owner-uid',
      coachEmail: 'coach@example.com',
      coachUid: null,
      invitedAt: '2026-09-01T00:00:00.000Z',
      acceptedAt: null,
    },
  };
  ownerTrades = [{ date: '2026-09-20', symbol: 'SPY', pnl: 100, sourceId: 'snaptrade:o1:c1' }];
  callerUid = 'coach-uid';
});

describe('claiming a pending coach seat', () => {
  it('lets the invited coach in once their address is confirmed', () => {
    // The feature still has to work, which is the whole reason the email branch exists.
    callerUid = 'coach-uid';
    return handleCoachSeatRequest({}, { action: 'coaching' }).then((result) => {
      expect(result.statusCode).toBe(200);
      expect((result.body as { journals: unknown[] }).journals).toHaveLength(1);
    });
  });

  it('keeps an unconfirmed address off the list entirely', async () => {
    /*
     * The attack. Same address, no confirmation link ever opened — and before this fix, the same
     * access: the journal appeared in their coaching list and every read below succeeded.
     */
    callerUid = 'impostor-uid';

    const result = await handleCoachSeatRequest({}, { action: 'coaching' });

    expect(result.statusCode).toBe(200);
    expect((result.body as { journals: unknown[] }).journals).toEqual([]);
  });

  it('refuses an unconfirmed address the journal itself', async () => {
    callerUid = 'impostor-uid';

    const result = await handleCoachSeatRequest({}, { action: 'journal', ownerUid: 'owner-uid' });

    expect(result.statusCode).toBe(403);
    // Told what to do about it, which leaks nothing: whether their own address is confirmed is a
    // fact about them, not about whether a seat exists.
    expect((result.body as { error: string }).error).toMatch(/confirm your email/i);
  });

  it('refuses an unconfirmed address the right to write a note', async () => {
    callerUid = 'impostor-uid';

    const result = await handleCoachSeatRequest(
      {},
      { action: 'note', ownerUid: 'owner-uid', date: '2026-09-20', body: 'size down' },
    );

    expect(result.statusCode).toBe(403);
  });

  it('still hides whether a seat exists from a stranger', async () => {
    /*
     * The vague refusal has to survive the new one. A confirmed account with the wrong address must
     * not be able to tell "no seat" from "somebody else's seat" — that would make this endpoint a way
     * to ask whether a given trader has a coach.
     */
    users['stranger-uid'] = { uid: 'stranger-uid', email: 'nobody@example.com', emailVerified: true };
    callerUid = 'stranger-uid';

    const missing = await handleCoachSeatRequest({}, { action: 'journal', ownerUid: 'no-such-owner' });
    const takenBySomeoneElse = await handleCoachSeatRequest(
      {},
      { action: 'journal', ownerUid: 'owner-uid' },
    );

    expect(missing.statusCode).toBe(403);
    expect(takenBySomeoneElse.statusCode).toBe(403);
    expect((missing.body as { error: string }).error).toBe(
      (takenBySomeoneElse.body as { error: string }).error,
    );
    expect((missing.body as { error: string }).error).not.toMatch(/confirm/i);
  });
});

describe('an accepted seat', () => {
  beforeEach(() => {
    seats['owner-uid'] = {
      ownerUid: 'owner-uid',
      coachEmail: 'coach@example.com',
      coachUid: 'coach-uid',
      invitedAt: '2026-09-01T00:00:00.000Z',
      acceptedAt: '2026-09-02T00:00:00.000Z',
    };
  });

  it('is matched by uid, so the address is never consulted again', async () => {
    // A coach who later unverifies is not a thing that happens, but a coach whose address the trader
    // changes is — and once a seat is bound, only the uid decides. Asserted so the fix above cannot
    // be mistaken for a reason to re-check the address here.
    users['coach-uid']!.emailVerified = false;
    callerUid = 'coach-uid';

    const result = await handleCoachSeatRequest({}, { action: 'journal', ownerUid: 'owner-uid' });
    expect(result.statusCode).toBe(200);
  });

  it('shuts out the address that used to hold it', async () => {
    callerUid = 'impostor-uid';
    const result = await handleCoachSeatRequest({}, { action: 'journal', ownerUid: 'owner-uid' });
    expect(result.statusCode).toBe(403);
  });
});
