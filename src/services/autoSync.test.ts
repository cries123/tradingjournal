import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Trade } from '../types';
import {
  accountsPerRun,
  autoSyncTradeId,
  chunkForWrite,
  decideAutoSync,
  journalForImports,
  lookbackStart,
  runAutoSync,
  TRADE_WRITE_CHUNK,
  type AutoSyncDeps,
} from '../../server/autoSync';
import { syncStartDate } from '../utils/syncWindow';

const trade = (over: Partial<Trade>): Trade =>
  ({ id: 't', date: '2026-08-03', symbol: 'SPY', pnl: 0, ...over }) as Trade;

describe('decideAutoSync', () => {
  const base = {
    tier: 'diamond' as const,
    connected: true,
    enabled: true,
    lastRunDate: null,
    today: '2026-08-10',
  };

  it('runs for the tier that includes it', () => {
    expect(decideAutoSync(base)).toEqual({ run: true });
  });

  it('refuses every tier below it', () => {
    for (const tier of ['free', 'silver', 'gold'] as const) {
      expect(decideAutoSync({ ...base, tier })).toEqual({ run: false, reason: 'not-entitled' });
    }
  });

  it('refuses an account with nothing connected', () => {
    expect(decideAutoSync({ ...base, connected: false })).toEqual({
      run: false,
      reason: 'no-connection',
    });
  });

  it('honours the trader switching it off', () => {
    expect(decideAutoSync({ ...base, enabled: false })).toEqual({
      run: false,
      reason: 'switched-off',
    });
  });

  it('never runs twice in the same market day', () => {
    // A scheduled function can fire more than once — a retry, or a redeploy landing on the
    // boundary. Without this a double fire is a doubled SnapTrade bill for nothing.
    expect(decideAutoSync({ ...base, lastRunDate: '2026-08-10' })).toEqual({
      run: false,
      reason: 'already-ran',
    });
    expect(decideAutoSync({ ...base, lastRunDate: '2026-08-09' })).toEqual({ run: true });
  });

  it('checks entitlement before anything else', () => {
    // A Gold account with the switch off is refused for the plan, not the switch — otherwise the
    // log would report a population of opt-outs that is really a population of non-buyers.
    expect(decideAutoSync({ ...base, tier: 'gold', enabled: false, connected: false })).toEqual({
      run: false,
      reason: 'not-entitled',
    });
  });
});

describe('lookbackStart', () => {
  it('steps back a fixed window in whole days', () => {
    expect(lookbackStart('2026-08-10', 10)).toBe('2026-07-31');
    expect(lookbackStart('2026-01-05', 10)).toBe('2025-12-26');
  });

  it('reads the date as UTC so the window is the same in every timezone', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
        process.env.TZ = zone;
        expect(lookbackStart('2026-11-08', 10)).toBe('2026-10-29');
      }
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('journalForImports', () => {
  it('uses the journal the last broker import landed in', () => {
    // Not the active one: a job at six in the morning has no idea which journal somebody left
    // selected, and a paper-trading journal full of real fills is a bad surprise.
    const journal = journalForImports(
      [
        trade({ date: '2026-08-01', sourceId: 'snaptrade:a:b', accountId: 'live' }),
        trade({ date: '2026-08-05', sourceId: 'snaptrade:c:d', accountId: 'futures' }),
      ],
      'paper',
    );
    expect(journal).toBe('futures');
  });

  it('ignores hand-typed trades when deciding', () => {
    const journal = journalForImports(
      [
        trade({ date: '2026-08-01', sourceId: 'snaptrade:a:b', accountId: 'live' }),
        trade({ date: '2026-08-09', accountId: 'paper' }),
      ],
      'paper',
    );
    expect(journal).toBe('live');
  });

  it('falls back to the active journal on the very first import', () => {
    expect(journalForImports([], 'default')).toBe('default');
    expect(journalForImports([trade({ date: '2026-08-01', accountId: 'paper' })], 'default')).toBe(
      'default',
    );
  });
});

describe('runAutoSync', () => {
  const deps = (over: Partial<AutoSyncDeps> = {}): AutoSyncDeps => ({
    today: '2026-08-10',
    listConnected: async () => [{ uid: 'u1', lastRunDate: null }],
    resolveTier: async () => 'diamond',
    readPreferences: async () => ({ enabled: true, activeAccountId: 'default' }),
    importFor: async () => ({ imported: 2, accounts: 1 }),
    markRun: async () => undefined,
    ...over,
  });

  it('imports and stamps the day', async () => {
    const markRun = vi.fn().mockResolvedValue(undefined);
    const summary = await runAutoSync(deps({ markRun }));

    expect(summary.ran).toBe(1);
    expect(summary.imported).toBe(2);
    expect(markRun).toHaveBeenCalledWith('u1', '2026-08-10', 2);
  });

  it('does not stamp a day whose import threw', async () => {
    // Stamping a failed run marks it done and skips the trader until tomorrow, which turns a
    // transient broker error into a missing day nobody notices.
    const markRun = vi.fn().mockResolvedValue(undefined);
    const summary = await runAutoSync(
      deps({
        importFor: async () => {
          throw new Error('broker said no');
        },
        markRun,
      }),
    );

    expect(summary.failed).toBe(1);
    expect(summary.ran).toBe(0);
    expect(markRun).not.toHaveBeenCalled();
    expect(summary.outcomes[0].error).toBe('broker said no');
  });

  it('steps over one broken account and keeps going', async () => {
    const summary = await runAutoSync(
      deps({
        listConnected: async () => [
          { uid: 'bad', lastRunDate: null },
          { uid: 'good', lastRunDate: null },
        ],
        importFor: async (uid) => {
          if (uid === 'bad') throw new Error('nope');
          return { imported: 3, accounts: 1 };
        },
      }),
    );

    expect(summary.failed).toBe(1);
    expect(summary.ran).toBe(1);
    expect(summary.imported).toBe(3);
  });

  it('imports nothing at all in a dry run', async () => {
    const importFor = vi.fn();
    const markRun = vi.fn();
    const summary = await runAutoSync(deps({ dryRun: true, importFor, markRun }));

    expect(importFor).not.toHaveBeenCalled();
    expect(markRun).not.toHaveBeenCalled();
    expect(summary.ran).toBe(1);
    expect(summary.imported).toBe(0);
  });

  it('counts a skip by its reason without touching the broker', async () => {
    const importFor = vi.fn();
    const summary = await runAutoSync(
      deps({ resolveTier: async () => 'gold', importFor }),
    );

    expect(importFor).not.toHaveBeenCalled();
    expect(summary.skipped['not-entitled']).toBe(1);
    expect(summary.ran).toBe(0);
  });

  it('stops at the per-run ceiling rather than timing out halfway', async () => {
    const summary = await runAutoSync(
      deps({
        listConnected: async () =>
          Array.from({ length: 10 }, (_, i) => ({ uid: `u${i}`, lastRunDate: null })),
        maxUsers: 3,
      }),
    );

    expect(summary.ran).toBe(3);
  });

  it('records an unreadable account as failed rather than importing blind', async () => {
    const importFor = vi.fn();
    const summary = await runAutoSync(
      deps({
        readPreferences: async () => {
          throw new Error('firestore is down');
        },
        importFor,
      }),
    );

    expect(importFor).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
  });
});

describe('accountsPerRun', () => {
  const withEnv = (value: string | undefined, run: () => void) => {
    const original = process.env.AUTO_SYNC_MAX_ACCOUNTS;
    if (value === undefined) delete process.env.AUTO_SYNC_MAX_ACCOUNTS;
    else process.env.AUTO_SYNC_MAX_ACCOUNTS = value;
    try {
      run();
    } finally {
      if (original === undefined) delete process.env.AUTO_SYNC_MAX_ACCOUNTS;
      else process.env.AUTO_SYNC_MAX_ACCOUNTS = original;
    }
  };

  it('caps the accounts one morning refreshes', () => {
    // Connections are unlimited because SnapTrade bills per person; activity pulls are billed per
    // call. Both cannot be true at once, so the cap is where they are reconciled.
    withEnv(undefined, () => expect(accountsPerRun()).toBe(3));
    withEnv('8', () => expect(accountsPerRun()).toBe(8));
  });

  it('ignores a value that would turn the cap off or make it absurd', () => {
    for (const bad of ['0', '-1', 'lots', '', '2.5', '400']) {
      withEnv(bad, () => expect(accountsPerRun()).toBe(3));
    }
  });
});

describe('chunkForWrite', () => {
  /*
   * The automatic importer wrote every fresh trade in ONE Firestore batch, which takes 500
   * operations. Ten days of an active 0DTE account is more than that, and the first automatic run
   * after connecting or after a journal clear has the whole window to write.
   *
   * What made it permanent rather than occasional: markRun only happens after a successful import,
   * so the failed morning left the window to widen and the next one failed harder. Diamond's
   * headline feature doing nothing, silently, for good.
   */
  it('stays under the Firestore batch limit', () => {
    expect(TRADE_WRITE_CHUNK).toBeLessThanOrEqual(500);

    const groups = chunkForWrite(Array.from({ length: 1000 }, (_, i) => i));
    for (const group of groups) {
      expect(group.length).toBeLessThanOrEqual(TRADE_WRITE_CHUNK);
    }
  });

  it('writes every item exactly once, in order', () => {
    // A chunker that drops or repeats one is worse than the bug it replaces: a dropped trade is a
    // missing fill and a repeated one is a duplicate, and both are invisible until somebody checks
    // their own numbers.
    const items = Array.from({ length: 905 }, (_, i) => i);
    expect(chunkForWrite(items).flat()).toEqual(items);
  });

  it('handles the ordinary case in one batch and nothing in none', () => {
    expect(chunkForWrite([1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(chunkForWrite([])).toEqual([]);
  });

  it('refuses a chunk size that would never terminate', () => {
    expect(() => chunkForWrite([1, 2], 0)).toThrow();
  });
});

describe('autoSyncTradeId', () => {
  it('is readable by the sync window, which is the whole point', () => {
    /*
     * The bug this fixes. The brokerage account survives onto a trade only in the document id —
     * accountId is the JOURNAL it was filed into — and syncStartDate reads that prefix to decide how
     * far back a manual sync has to ask for.
     *
     * The old ids were `autosync_<stamp>_<i>`, invisible to that check. So a Diamond trader whose
     * trades arrived automatically looked like someone who had never imported anything, and every
     * manual sync pulled their entire history again — the exact bug b2198f6 fixed for the manual
     * path, re-introduced through the other write path.
     */
    const id = autoSyncTradeId('schwab-acct-1', 1_700_000_000_000, 7);
    const imported = [trade({ id, date: '2026-09-20', sourceId: 'snaptrade:o1:c1' })];

    expect(syncStartDate(imported, 'schwab-acct-1', new Date(2026, 8, 30))).toBe('2026-09-06');
  });

  it('matches the manual importer letter for letter up to the account', () => {
    // Both paths write into one journal, so an id scheme that differs between them is a difference
    // nothing downstream can account for.
    expect(autoSyncTradeId('acct', 1234, 0).startsWith('snaptrade_acct_')).toBe(true);
  });

  it('keeps the trades of one account out of another account’s window', () => {
    const otherAccount = [trade({ id: autoSyncTradeId('robinhood-1', 1234, 0), date: '2026-09-29' })];
    expect(syncStartDate(otherAccount, 'schwab-acct-1', new Date(2026, 8, 30))).toBeUndefined();
  });

  it('still says it was automatic', () => {
    // Provenance after the prefix the check needs, so both facts fit in one id.
    expect(autoSyncTradeId('acct', 1234, 9)).toBe('snaptrade_acct_auto1234_0009');
  });

  it('sorts in import order as a string, which is how it is read back', () => {
    /*
     * The id IS the import sequence. Firestore returns a collection with no orderBy in document-id
     * order — lexicographic — and the trade list is then sorted by date alone, a stable sort, so
     * within a day the id order is what survives and what the rule simulator replays.
     *
     * Unpadded, `_10` sorted before `_2`. So any day with eleven or more trades replayed in an order
     * that was not even the importer's — and those are exactly the days a maxTradesPerDay rule acts
     * on, the only days that contribute to the simulator's headline figure.
     */
    const ids = Array.from({ length: 12 }, (_, i) => autoSyncTradeId('acct', 1234, i));

    expect([...ids].sort()).toEqual(ids);
  });

  it('keeps sorting in order across a long day', () => {
    // Four digits, so the padding does not run out before a plausible day does.
    const ids = Array.from({ length: 300 }, (_, i) => autoSyncTradeId('acct', 1234, i));
    expect([...ids].sort()).toEqual(ids);
  });

  it('gives every trade in a run its own id', () => {
    const ids = new Set(Array.from({ length: 50 }, (_, i) => autoSyncTradeId('acct', 1234, i)));
    expect(ids.size).toBe(50);
  });
});

describe('which trades the journal choice is made from', () => {
  it('asks the newest trades, not the ten-day dedupe window', () => {
    /*
     * journalForImports picks the journal the trader last imported broker trades into, and the
     * handler was handing it the dedupe window — ten days. Anyone who had not traded for a fortnight
     * therefore had no broker trade in that list, so it fell through to the ACTIVE journal, and the
     * comment on that fallback names the harm exactly: "someone who left a paper-trading journal
     * selected would find real fills in it". A holiday was enough.
     *
     * Asserted against the source because importFor lives in the Netlify handler, which vitest does
     * not collect — the same idiom as the streaming refund's coupling test. The behaviour below is
     * what the function does with each list; this is what it gets handed.
     */
    const handler = readFileSync('netlify/functions/auto-sync.ts', 'utf8');

    expect(handler).toContain('journalForImports(await journalCandidates(uid), activeAccountId)');
    expect(handler).not.toMatch(/journalForImports\(existing/);
  });

  it('files into the journal of the most recent broker import, not the active one', () => {
    // The behaviour that makes the list above worth widening: given a broker trade from any date, it
    // wins over whatever journal happens to be selected.
    const old = [
      trade({ date: '2026-07-01', accountId: 'real-money', sourceId: 'snaptrade:o1:c1' }),
      trade({ date: '2026-06-01', accountId: 'paper', sourceId: 'snaptrade:o2:c2' }),
    ];

    expect(journalForImports(old, 'paper')).toBe('real-money');
    // And with nothing imported ever, the active journal is still the only signal there is.
    expect(journalForImports([], 'paper')).toBe('paper');
  });
});
