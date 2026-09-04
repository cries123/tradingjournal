import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The guards that stop one person taking a free trial per account.
 *
 * Every one of them is a deterrent rather than a wall, and each is checked here for the failure
 * that actually costs money: refusing somebody real. A trial farmed costs about a dollar; a
 * customer told their own brokerage is spoken for is gone.
 */

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();

const snapshotOf = (path: string) => {
  const data = store.get(path);
  return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
};

const collectionOf = (prefix: string) => ({
  where: (field: string, _op: string, value: unknown) => ({
    limit: () => ({
      get: async () => {
        const docs = [...store.entries()]
          .filter(([path]) => path.startsWith(`${prefix}/`))
          .filter(([, data]) => data[field] === value)
          .map(([, data]) => ({ data: () => ({ ...data }) }));
        return { empty: docs.length === 0, docs };
      },
    }),
  }),
});

const fakeDb = {
  doc: (path: string) => ({
    get: async () => snapshotOf(path),
    set: async (data: Doc, options?: { merge?: boolean }) => {
      store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data });
    },
    create: async (data: Doc) => {
      if (store.has(path)) throw new Error('already exists');
      store.set(path, { ...data });
    },
  }),
  collection: collectionOf,
};

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: fakeDb.doc,
    collection: (name: string) => fakeDb.collection(name),
  }),
  getAdminAuth: () => ({}),
}));

import {
  brokerageKey,
  brokerageOwner,
  claimBrokerage,
  findTrialClaim,
  flagsForClaim,
  identityHash,
  mailboxKey,
  recordTrialClaim,
} from '../../server/trialGuards';

beforeEach(() => store.clear());

describe('what gets stored', () => {
  it('stores a hash, never the address itself', () => {
    const key = mailboxKey('jay@gmail.com');
    expect(key).not.toBeNull();
    expect(key).not.toContain('jay');
    expect(key).not.toContain('@');
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('gives the same key to the same mailbox spelled differently', () => {
    expect(mailboxKey('J.a.y+trial@gmail.com')).toBe(mailboxKey('jay@gmail.com'));
  });

  it('gives different keys to different people', () => {
    expect(mailboxKey('jay@gmail.com')).not.toBe(mailboxKey('jaye@gmail.com'));
  });

  it('refuses to key anything on an unusable address', () => {
    expect(mailboxKey('not-an-address')).toBeNull();
    expect(mailboxKey(null)).toBeNull();
  });

  it('salts the hash, so a guessed address cannot be checked against what is stored', () => {
    const before = identityHash('jay@gmail.com');
    vi.stubEnv('IDENTITY_HASH_SALT', 'something-else');
    expect(identityHash('jay@gmail.com')).not.toBe(before);
    vi.unstubAllEnvs();
  });
});

describe('identifying a brokerage account across two signups', () => {
  it('is the institution and the masked number together', () => {
    expect(brokerageKey('Schwab', '****1234')).toBe(brokerageKey('  schwab ', '****1234'));
    expect(brokerageKey('Schwab', '****1234')).not.toBe(brokerageKey('Robinhood', '****1234'));
    expect(brokerageKey('Schwab', '****1234')).not.toBe(brokerageKey('Schwab', '****9999'));
  });

  it('declines to identify anything from a number too short to be one', () => {
    // Hashing "**" would collide every account at a brokerage into one, and refuse them all.
    for (const number of ['', '  ', '12', '***']) {
      expect(brokerageKey('Schwab', number)).toBeNull();
    }
    expect(brokerageKey(null, '****1234')).toBeNull();
  });

  it('keeps the first account that linked it, and does not let a later one take it over', async () => {
    const key = brokerageKey('Schwab', '****1234') as string;
    await claimBrokerage(key, 'first-user');
    await claimBrokerage(key, 'second-user');
    expect(await brokerageOwner(key)).toBe('first-user');
  });

  it('answers null for a brokerage nobody has linked', async () => {
    expect(await brokerageOwner(brokerageKey('Schwab', '****0000') as string)).toBeNull();
  });
});

describe('remembering a claim', () => {
  it('finds the claim on a mailbox, whichever way the address was spelled', async () => {
    const key = mailboxKey('jay+one@gmail.com') as string;
    await recordTrialClaim(key, 'u1', {}, []);

    const claim = await findTrialClaim(mailboxKey('j.ay@googlemail.com') as string);
    expect(claim?.uid).toBe('u1');
  });

  it('has nothing to say about a mailbox that has never claimed one', async () => {
    expect(await findTrialClaim(mailboxKey('new@example.com') as string)).toBeNull();
  });
});

describe('the flags, which never refuse anybody', () => {
  const claimFrom = async (uid: string, visitorId: string, ip: string) => {
    const key = mailboxKey(`${uid}@example.com`) as string;
    await recordTrialClaim(key, uid, { visitorId, ip }, []);
  };

  it('says nothing about the first trial from a browser', async () => {
    expect(await flagsForClaim('u1', { visitorId: 'browser-a', ip: '1.2.3.4' })).toEqual([]);
  });

  it('notices a second trial from the same browser', async () => {
    await claimFrom('u1', 'browser-a', '1.2.3.4');
    expect(await flagsForClaim('u2', { visitorId: 'browser-a', ip: '9.9.9.9' })).toEqual([
      'same-browser-as-an-earlier-trial',
    ]);
  });

  it('does not flag somebody for their own earlier claim', async () => {
    await claimFrom('u1', 'browser-a', '1.2.3.4');
    expect(await flagsForClaim('u1', { visitorId: 'browser-a', ip: '1.2.3.4' })).toEqual([]);
  });

  it('tolerates a household or an office, and notices a farm', async () => {
    // Two people behind one address is a couple, a family, a small office. Not a signal.
    await claimFrom('u1', 'browser-a', '1.2.3.4');
    await claimFrom('u2', 'browser-b', '1.2.3.4');
    expect(await flagsForClaim('u3', { visitorId: 'browser-c', ip: '1.2.3.4' })).toEqual([]);

    await claimFrom('u3', 'browser-c', '1.2.3.4');
    expect(await flagsForClaim('u4', { visitorId: 'browser-d', ip: '1.2.3.4' })).toEqual([
      'several-trials-from-one-network',
    ]);
  });

  it('says nothing when the browser and address are unknown', async () => {
    expect(await flagsForClaim('u1', {})).toEqual([]);
  });
});
