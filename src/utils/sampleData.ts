import type { Trade } from '../types';
import { toDateKey } from './format';

export const SAMPLE_ID_PREFIX = 'sample-';

interface SampleDay {
  /** Day of month offset backwards from today (0 = today). */
  daysAgo: number;
  trades: { symbol: string; pnl: number; setup: string; side: 'long' | 'short'; notes?: string }[];
}

const SAMPLE_DAYS: SampleDay[] = [
  { daysAgo: 0, trades: [{ symbol: 'SPY', pnl: 128, setup: 'BREAKOUT', side: 'long' }] },
  {
    daysAgo: 1,
    trades: [
      { symbol: 'QQQ', pnl: 341, setup: 'REVERSAL', side: 'long', notes: 'Waited for confirmation — textbook entry.' },
    ],
  },
  {
    daysAgo: 2,
    trades: [
      { symbol: 'SPY', pnl: 210, setup: 'BREAKOUT', side: 'long' },
      { symbol: 'AAPL', pnl: -90, setup: 'FOMO', side: 'long', notes: 'Chased the open. Should have waited.' },
    ],
  },
  { daysAgo: 3, trades: [{ symbol: 'NVDA', pnl: 626, setup: 'BREAKOUT', side: 'long', notes: 'Best trade of the month — sized right, let it run.' }] },
  { daysAgo: 6, trades: [{ symbol: 'SPY', pnl: 175, setup: 'RSI CROSSED', side: 'long' }] },
  {
    daysAgo: 7,
    trades: [{ symbol: 'TSLA', pnl: -500, setup: 'FOMO', side: 'short', notes: 'Revenge traded after the morning stop-out.' }],
  },
  { daysAgo: 8, trades: [{ symbol: 'AAPL', pnl: 132, setup: 'REVERSAL', side: 'long' }] },
  {
    daysAgo: 9,
    trades: [
      { symbol: 'NVDA', pnl: -520, setup: 'FOMO', side: 'long', notes: 'Ignored the plan. Max loss day.' },
      { symbol: 'SPY', pnl: -222, setup: 'BREAKOUT', side: 'long' },
    ],
  },
  { daysAgo: 13, trades: [{ symbol: 'TSLA', pnl: 132, setup: 'RSI CROSSED', side: 'long' }] },
  {
    daysAgo: 14,
    trades: [
      { symbol: 'AAPL', pnl: 120, setup: 'REVERSAL', side: 'long' },
      { symbol: 'SPY', pnl: 64, setup: 'BREAKOUT', side: 'long' },
    ],
  },
  { daysAgo: 15, trades: [{ symbol: 'SPY', pnl: 162, setup: 'BREAKOUT', side: 'long' }] },
];

/** Realistic example month, clearly marked with sample- ids so it can be cleared and never synced. */
export function buildSampleTrades(accountId: string, now = new Date()): Trade[] {
  const trades: Trade[] = [];
  let id = 1;

  for (const day of SAMPLE_DAYS) {
    const d = new Date(now);
    d.setDate(d.getDate() - day.daysAgo);
    // Keep sample sessions on weekdays so the calendar looks like real trading.
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() - 1);
    }
    const date = toDateKey(d);

    for (const t of day.trades) {
      trades.push({
        id: `${SAMPLE_ID_PREFIX}${id++}`,
        date,
        symbol: t.symbol,
        pnl: t.pnl,
        setup: t.setup,
        side: t.side,
        notes: t.notes,
        accountId,
      });
    }
  }

  return trades;
}

export function isSampleTrade(trade: Trade): boolean {
  return trade.id.startsWith(SAMPLE_ID_PREFIX);
}
