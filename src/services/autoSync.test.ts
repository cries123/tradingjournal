import { describe, expect, it, vi } from 'vitest';
import type { Trade } from '../types';
import {
  accountsPerRun,
  decideAutoSync,
  journalForImports,
  lookbackStart,
  runAutoSync,
  type AutoSyncDeps,
} from '../../server/autoSync';

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
