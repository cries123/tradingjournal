import { describe, expect, it, vi } from 'vitest';

/*
 * The confirmation on self-serve deletion.
 *
 * This endpoint removes every trade, note and journal an account has, with no export afterwards
 * and no way back. The typed DELETE exists in the dialog, but a confirmation that lives only in
 * the client is not a confirmation — this endpoint is reachable without ever opening that dialog.
 *
 * The check therefore runs before anything else touches the database, which is what these assert:
 * a wrong confirmation must be refused without a single read, let alone a delete. purgeAccount is
 * mocked so that a regression reordering those two lines fails here rather than on somebody's
 * account.
 */

const purged: string[] = [];

vi.mock('../../server/accountTeardown', () => ({
  purgeAccount: async (uid: string) => {
    purged.push(uid);
  },
}));

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => {
    throw new Error('the database must not be touched before the confirmation is checked');
  },
  getAdminAuth: () => ({}),
}));

const { deleteOwnAccount, AccountRequestError } = await import('../../server/accountHandler');

describe('deleteOwnAccount', () => {
  it('refuses an empty confirmation without touching anything', async () => {
    await expect(deleteOwnAccount('u1', '')).rejects.toThrow(AccountRequestError);
    expect(purged).toEqual([]);
  });

  it('refuses the wrong word', async () => {
    await expect(deleteOwnAccount('u1', 'delete my account')).rejects.toThrow(/Type DELETE/);
    expect(purged).toEqual([]);
  });

  it('refuses a confirmation that merely contains the word', async () => {
    // "Please DELETE it" is somebody talking, not somebody confirming.
    await expect(deleteOwnAccount('u1', 'please DELETE it')).rejects.toThrow(/Type DELETE/);
    expect(purged).toEqual([]);
  });

  it('accepts the word in any case, with stray whitespace', async () => {
    // It gets past the confirmation and then fails on the mocked database, which is the proof that
    // the confirmation was what let it through — the admin lookup is the very next line.
    await expect(deleteOwnAccount('u1', '  delete  ')).rejects.toThrow(/must not be touched/);
  });
});
