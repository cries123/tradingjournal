import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * What "delete my account" actually deletes.
 *
 * The function had no test of its contents, and the thing it had never deleted was the only thing
 * the account leaves on the public internet: a published track record, carrying the trader's handle,
 * win rate and P&L under a "verified by Trend Chasers" badge, with the button that would take it
 * down behind an account that no longer exists.
 *
 * A test per collection is worth it here because the failure is invisible. Nothing in the app reads
 * these paths afterwards, so anything left behind stays left behind, and the person was told it was
 * gone. The list below is the promise; this is what holds it to it.
 */

/** collectionPath -> doc ids still present. */
let store: Record<string, string[]> = {};
/** trackRecordOwners slug -> uid, and usernames handle -> uid. */
let recordOwners: Record<string, string> = {};
let usernameOwners: Record<string, string> = {};

let deleted: string[] = [];
let brokerLinkReset: string[] = [];
/** Subscription ids cancelled at Creem. The money stops here or it does not stop. */
let cancelled: string[] = [];
let cancelFails = false;
/** The entitlement the account holds, read by purgeAccount to find the subscription. */
let entitlement: Record<string, unknown> | null = null;
let authDeleted: string[] = [];
/** Set to a Firebase error code to make the Auth delete fail that way. */
let authFailsWith: string | null = null;
/** Everything in order, so "the Auth record goes last" can be asserted. */
let sequence: string[] = [];

const fakeDoc = (path: string) => ({
  __path: path,
  delete: async () => {
    deleted.push(path);
    sequence.push(`delete:${path}`);
  },
});

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => fakeDoc(path),
    collection: (path: string) => ({
      limit: () => ({
        get: async () => {
          const ids = store[path] ?? [];
          return {
            empty: ids.length === 0,
            size: ids.length,
            docs: ids.map((id) => ({ id, ref: fakeDoc(`${path}/${id}`) })),
          };
        },
      }),
      where: (_field: string, _op: string, value: string) => ({
        get: async () => {
          const source = path === 'usernames' ? usernameOwners : recordOwners;
          const ids = Object.keys(source).filter((id) => source[id] === value);
          return {
            empty: ids.length === 0,
            size: ids.length,
            docs: ids.map((id) => ({ id, ref: fakeDoc(`${path}/${id}`) })),
          };
        },
      }),
    }),
    batch: () => ({
      delete: (ref: { __path: string }) => {
        deleted.push(ref.__path);
        sequence.push(`delete:${ref.__path}`);
        // Mirrors a real delete so the paging loop in deleteCollectionDocs terminates.
        const cut = ref.__path.lastIndexOf('/');
        const collectionPath = ref.__path.slice(0, cut);
        const id = ref.__path.slice(cut + 1);
        store[collectionPath] = (store[collectionPath] ?? []).filter((x) => x !== id);
      },
      commit: async () => {},
    }),
  }),
  getAdminAuth: () => ({
    deleteUser: async (uid: string) => {
      sequence.push(`auth:${uid}`);
      if (authFailsWith) {
        throw Object.assign(new Error('auth refused'), { code: authFailsWith });
      }
      authDeleted.push(uid);
    },
  }),
}));

vi.mock('../../server/creemClient', () => ({
  cancelSubscription: async (id: string) => {
    if (cancelFails) throw new Error('Could not cancel the subscription.');
    cancelled.push(id);
    sequence.push('cancel:' + id);
  },
}));

vi.mock('../../server/entitlements', () => ({
  readEntitlement: async () => entitlement,
}));

vi.mock('../../server/adminAccountActions', () => ({
  resetBrokerLink: async (uid: string) => {
    brokerLinkReset.push(uid);
    sequence.push(`broker:${uid}`);
  },
}));

const { purgeAccount } = await import('../../server/accountTeardown');

beforeEach(() => {
  store = {
    'users/u1/trades': ['t1', 't2'],
    'users/u1/settings': ['preferences'],
    'users/u1/dayNotes': ['2026-09-29'],
    'users/u1/takeaways': ['2026-09'],
    'users/u1/private': ['snaptrade'],
    'journalEvents/u1/events': ['e1'],
  };
  recordOwners = {};
  usernameOwners = {};
  deleted = [];
  brokerLinkReset = [];
  cancelled = [];
  cancelFails = false;
  entitlement = null;
  authDeleted = [];
  authFailsWith = null;
  sequence = [];
});

describe('purgeAccount', () => {
  it('empties every collection the account owns', async () => {
    await purgeAccount('u1');

    for (const path of [
      'users/u1/trades/t1',
      'users/u1/trades/t2',
      'users/u1/settings/preferences',
      'users/u1/dayNotes/2026-09-29',
      'users/u1/takeaways/2026-09',
      // The SnapTrade userSecret: the one document nobody should ever be able to leave behind.
      'users/u1/private/snaptrade',
      // The clear/sync history. Admin SDK only, so nothing else would ever have removed it.
      'journalEvents/u1/events/e1',
    ]) {
      expect(deleted, path).toContain(path);
    }
  });

  it('takes down a published track record, which is the only public thing left behind', async () => {
    /*
     * This was missing entirely. Deleting the account removed the journal and left the page: handle,
     * win rate, P&L and a verified badge, online for good.
     */
    recordOwners.jay = 'u1';

    await purgeAccount('u1');

    expect(deleted).toContain('trackRecords/jay');
    expect(deleted).toContain('trackRecordOwners/jay');
  });

  it('takes down a record published under a handle retired by a rename', async () => {
    // Found by ownership, not by the current username, so an old slug is not stranded.
    recordOwners.oldhandle = 'u1';
    usernameOwners.newhandle = 'u1';

    await purgeAccount('u1');

    expect(deleted).toContain('trackRecords/oldhandle');
  });

  it('does not touch another trader’s record', async () => {
    recordOwners.someoneelse = 'u2';

    await purgeAccount('u1');

    expect(deleted.some((p) => p.includes('someoneelse'))).toBe(false);
  });

  it('releases every username the account ever held', async () => {
    usernameOwners.jay = 'u1';
    usernameOwners.oldhandle = 'u1';
    usernameOwners.somebody = 'u2';

    await purgeAccount('u1');

    expect(deleted).toContain('usernames/jay');
    expect(deleted).toContain('usernames/oldhandle');
    expect(deleted).not.toContain('usernames/somebody');
  });

  it('clears the SnapTrade user, which is what stops the billing', async () => {
    // $1.00 per connected person per month, charged until the user under it is deleted — and nothing
    // else would ever delete one belonging to an account that no longer exists.
    await purgeAccount('u1');

    expect(brokerLinkReset).toEqual(['u1']);
    expect(deleted).toContain('brokerConnections/u1');
    expect(deleted).toContain('usageCredits/u1');
  });

  it('deletes the sign-in last, after the data it gates', async () => {
    // Ordered so the expensive external call happens while the account still exists. If Auth went
    // first, a failure midway would leave data nobody can sign in to reach or delete.
    recordOwners.jay = 'u1';

    await purgeAccount('u1');

    expect(sequence[sequence.length - 1]).toBe('auth:u1');
    expect(sequence.indexOf('broker:u1')).toBeLessThan(sequence.indexOf('auth:u1'));
  });

  it('treats an already-deleted sign-in as success', async () => {
    // Already gone is the outcome that was wanted, not a failure to report.
    authFailsWith = 'auth/user-not-found';

    await expect(purgeAccount('u1')).resolves.toBeUndefined();
    expect(sequence).toContain('auth:u1');
  });

  it('still reports any other Auth failure', async () => {
    // The flip side, and the reason the check is on the code rather than on it having thrown: a
    // refusal that is not "already gone" means the account can still be signed into, and silently
    // swallowing it would report a deletion that did not finish.
    authFailsWith = 'auth/internal-error';

    await expect(purgeAccount('u1')).rejects.toThrow(/auth refused/);
  });
});

describe('the subscription behind a deleted account', () => {
  /*
   * Deleting a Firebase Auth user tells Creem nothing. So this routine removed the journal, the
   * notes, the brokerage link and the sign-in, and left the subscription renewing every month against
   * somebody with no account to sign in with — no portal, no checkout, no way to stop it — while the
   * delete dialog promised "Any subscription stops billing." The comment in accountHandler justifying
   * the lack of a subscription check asserted the same false thing.
   */
  it('is cancelled at the processor', async () => {
    entitlement = { tier: 'gold', source: 'purchase', status: 'active', creemSubscriptionId: 'sub_123' };

    await purgeAccount('u1');

    expect(cancelled).toEqual(['sub_123']);
  });

  it('is cancelled BEFORE the account it belongs to is taken apart', async () => {
    // Afterwards there is no entitlement to read the subscription id from, and no sign-in behind
    // which anybody could cancel it by hand.
    entitlement = { tier: 'gold', source: 'purchase', status: 'active', creemSubscriptionId: 'sub_123' };

    await purgeAccount('u1');

    expect(sequence[0]).toBe('cancel:sub_123');
    expect(sequence.indexOf('cancel:sub_123')).toBeLessThan(sequence.indexOf('auth:u1'));
  });

  it('stops the whole deletion when the cancel fails', async () => {
    /*
     * The one step here that is deliberately not best-effort. If the cancel fails the money is still
     * moving, and a deletion that succeeded anyway would destroy the only account from which the
     * charge could be reached. Refusing lets them cancel in Manage billing and try again.
     */
    entitlement = { tier: 'gold', source: 'purchase', status: 'active', creemSubscriptionId: 'sub_123' };
    cancelFails = true;

    await expect(purgeAccount('u1')).rejects.toThrow(/cancel the subscription/i);

    // And nothing was destroyed on the way to that refusal.
    expect(deleted).toEqual([]);
    expect(authDeleted).toEqual([]);
  });

  it('deletes an account that never subscribed without calling Creem at all', async () => {
    entitlement = { tier: 'free', source: 'purchase', status: 'active' };

    await purgeAccount('u1');

    expect(cancelled).toEqual([]);
    expect(authDeleted).toEqual(['u1']);
  });

  it('removes the entitlement row, which nothing else ever did', async () => {
    /*
     * It outlived every deleted account, and readSubscriptionRunRate counts any row with status
     * 'active', source 'purchase' and a subscription id — so a deleted customer went on being counted
     * in the admin MRR and subscriber totals for good.
     */
    entitlement = { tier: 'gold', source: 'purchase', status: 'active', creemSubscriptionId: 'sub_123' };

    await purgeAccount('u1');

    expect(deleted).toContain('entitlements/u1');
  });
});

describe('the cancel call itself', () => {
  /*
   * Asserted against the source, because every test above mocks the Creem client — its four lines
   * cannot be exercised without a live payment API, and a mutation run confirmed that: pointing the
   * cancel at the UPGRADE path, or scheduling it instead of taking effect now, both survived every
   * test in this file.
   *
   * Both are silent in production. The upgrade path would return a success for a call that changes
   * no plan, and a scheduled cancel keeps billing a customer for a journal that no longer exists.
   */
  const client = readFileSync('server/creemClient.ts', 'utf8');

  it('posts to the cancel endpoint, not the upgrade one beside it', () => {
    expect(client).toContain('/subscriptions/${encodeURIComponent(subscriptionId)}/cancel');
  });

  it('takes effect now, because the access is going now', () => {
    expect(client).toMatch(/cancelSubscription[\s\S]{0,400}mode: 'immediate'/);
  });

  it('throws rather than reporting a cancel it did not make', () => {
    // creemPost throws on a non-2xx; the point here is that cancelSubscription does not catch it.
    const fn = client.slice(client.indexOf('export async function cancelSubscription'));
    expect(fn.slice(0, 400)).not.toContain('catch');
  });
});
