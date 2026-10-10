import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseDb: () => ({}),
  getFirebaseAuth: () => ({ currentUser: null }),
}));

const { combineTradeAggregates } = await import('./admin');

/*
 * The admin's per-user trade stats, from aggregations instead of a full read of every journal.
 *
 * Every admin-panel load and every Refresh read every trade of every user. Firestore bills per
 * document read and this project has been knocked over by read quota before. The counts now come
 * back as numbers the server computes; these tests cover the part that is still ours — turning those
 * numbers into what the panel shows.
 */

const base = {
  count: 10,
  totalPnl: 250,
  wins: 6,
  losses: 3,
  savedLast7Days: 2,
  sessionLast7Days: 4,
  lastSavedAt: '2026-10-09T14:00:00.000Z',
  lastDate: '2026-10-09',
  firstDate: '2026-01-05',
};

describe('combining the aggregates', () => {
  it('passes the counts and dates straight through', () => {
    expect(combineTradeAggregates(base)).toMatchObject({
      tradeCount: 10,
      totalPnl: 250,
      lastTradeDate: '2026-10-09',
      firstTradeDate: '2026-01-05',
      tradesSavedLast7Days: 2,
      tradesSessionLast7Days: 4,
      lastTradeActivityAt: '2026-10-09T14:00:00.000Z',
    });
  });

  it('computes win rate over decided trades only, as the full scan did', () => {
    // A scratch trade — pnl exactly 0 — is neither a win nor a loss, so 6 of 9, not 6 of 10.
    expect(combineTradeAggregates(base).winRate).toBeCloseTo((6 / 9) * 100);
    expect(combineTradeAggregates({ ...base, wins: 0, losses: 0 }).winRate).toBeNull();
  });

  it('falls back to the session date only when nothing carries a save time', () => {
    // Legacy trades from before savedAt existed. With any save time present, that wins.
    expect(combineTradeAggregates({ ...base, lastSavedAt: null }).lastTradeActivityAt).toBe(
      '2026-10-09T23:59:59.000Z',
    );
    expect(combineTradeAggregates({ ...base, lastSavedAt: null, lastDate: null }).lastTradeActivityAt).toBeNull();
  });

  it('reads an empty journal as no trades at all, not as a zero P&L', () => {
    // EMPTY_TRADE_STATS has totalPnl null; 0 would read as "traded and broke even".
    expect(combineTradeAggregates({ ...base, count: 0 })).toMatchObject({ tradeCount: 0, totalPnl: null, winRate: null });
  });
});

describe('the loader', () => {
  const ADMIN = readFileSync(join(process.cwd(), 'src/services/admin.ts'), 'utf-8');
  const loader = ADMIN.slice(
    ADMIN.indexOf('async function fetchUserTradeStats'),
    ADMIN.indexOf('async function fetchUserTradeStats') + 2600,
  );

  it('no longer reads every trade document', () => {
    expect(loader).not.toContain('getDocs(tradesCol)');
    expect(loader).toContain('getAggregateFromServer(tradesCol');
  });

  it('bounds every date query on both sides, so legacy M/D/YYYY dates cannot sort as newest', () => {
    // "9/30/2026" sorts above every "2026-…" string. Unbounded, it would be every user's last date.
    const dateFilters = loader.match(/where\('date', '>=',[^)]*\)/g) ?? [];
    const ceilings = loader.match(/where\('date', '<=', ISO_DATE_CEILING\)/g) ?? [];
    expect(dateFilters.length).toBe(3);
    expect(ceilings.length).toBe(3);
  });
});
