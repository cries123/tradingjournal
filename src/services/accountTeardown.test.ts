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
