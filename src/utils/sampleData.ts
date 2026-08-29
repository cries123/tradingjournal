import type { Trade } from '../types';
import { toDateKey } from './format';

export const SAMPLE_ID_PREFIX = 'sample-';

interface SampleTrade {
  symbol: string;
  pnl: number;
  setup: string;
  side: 'long' | 'short';
  notes?: string;
  /** Local HH:MM. Drives the time-of-day breakdown, so these are deliberately consistent with
   *  the story the sample tells: the FOMO trades are opening-bell entries and they lose. */
  entryTime: string;
  exitTime: string;
  /** Worst drawdown the trade went through, in dollars. */
  mae: number;
  /** Best unrealised profit the trade reached, in dollars. */
  mfe: number;
  /** Result in units of the risk taken. */
  rMultiple: number;
}

interface SampleDay {
  /** Day of month offset backwards from today (0 = today). */
  daysAgo: number;
  trades: SampleTrade[];
}

const SAMPLE_DAYS: SampleDay[] = [
  {
    daysAgo: 0,
    trades: [
      { symbol: 'SPY', pnl: 128, setup: 'BREAKOUT', side: 'long', entryTime: '10:45', exitTime: '11:30', mae: 40, mfe: 240, rMultiple: 0.85 },
    ],
  },
  {
    daysAgo: 1,
    trades: [
      { symbol: 'QQQ', pnl: 341, setup: 'REVERSAL', side: 'long', notes: 'Waited for confirmation — textbook entry.', entryTime: '13:10', exitTime: '14:40', mae: 55, mfe: 395, rMultiple: 2.3 },
    ],
  },
  {
    daysAgo: 2,
    trades: [
      { symbol: 'SPY', pnl: 210, setup: 'BREAKOUT', side: 'long', entryTime: '10:50', exitTime: '11:55', mae: 65, mfe: 280, rMultiple: 1.4 },
      { symbol: 'AAPL', pnl: -90, setup: 'FOMO', side: 'long', notes: 'Chased the open. Should have waited.', entryTime: '09:34', exitTime: '09:52', mae: 130, mfe: 45, rMultiple: -0.6 },
    ],
  },
  {
    daysAgo: 3,
    trades: [
      { symbol: 'NVDA', pnl: 626, setup: 'BREAKOUT', side: 'long', notes: 'Best trade of the month — sized right, let it run.', entryTime: '10:20', exitTime: '14:05', mae: 80, mfe: 700, rMultiple: 3.1 },
    ],
  },
  {
    daysAgo: 6,
    trades: [
      { symbol: 'SPY', pnl: 175, setup: 'RSI CROSSED', side: 'long', entryTime: '11:15', exitTime: '12:40', mae: 50, mfe: 240, rMultiple: 1.1 },
    ],
  },
  {
    daysAgo: 7,
    trades: [
      { symbol: 'TSLA', pnl: -500, setup: 'FOMO', side: 'short', notes: 'Revenge traded after the morning stop-out.', entryTime: '09:41', exitTime: '10:25', mae: 560, mfe: 60, rMultiple: -2.0 },
    ],
  },
  {
    daysAgo: 8,
    trades: [
      { symbol: 'AAPL', pnl: 132, setup: 'REVERSAL', side: 'long', entryTime: '13:30', exitTime: '15:10', mae: 45, mfe: 165, rMultiple: 0.9 },
    ],
  },
  {
    daysAgo: 9,
    trades: [
      { symbol: 'NVDA', pnl: -520, setup: 'FOMO', side: 'long', notes: 'Ignored the plan. Max loss day.', entryTime: '09:37', exitTime: '10:12', mae: 585, mfe: 95, rMultiple: -2.1 },
      { symbol: 'SPY', pnl: -222, setup: 'BREAKOUT', side: 'long', entryTime: '10:05', exitTime: '11:00', mae: 260, mfe: 140, rMultiple: -0.9 },
    ],
  },
  {
    daysAgo: 13,
    trades: [
      { symbol: 'TSLA', pnl: 132, setup: 'RSI CROSSED', side: 'long', entryTime: '11:40', exitTime: '13:05', mae: 60, mfe: 290, rMultiple: 0.8 },
    ],
  },
  {
    daysAgo: 14,
    trades: [
      { symbol: 'AAPL', pnl: 120, setup: 'REVERSAL', side: 'long', entryTime: '14:10', exitTime: '15:30', mae: 35, mfe: 175, rMultiple: 0.8 },
      { symbol: 'SPY', pnl: 64, setup: 'BREAKOUT', side: 'long', entryTime: '10:40', exitTime: '11:20', mae: 40, mfe: 210, rMultiple: 0.4 },
    ],
  },
  {
    daysAgo: 15,
    trades: [
      { symbol: 'SPY', pnl: 162, setup: 'BREAKOUT', side: 'long', entryTime: '09:45', exitTime: '10:50', mae: 70, mfe: 205, rMultiple: 1.0 },
    ],
  },
];


/** Realistic example month, clearly marked with sample- ids so it can be cleared and never synced. */
export function buildSampleTrades(accountId: string, now = new Date()): Trade[] {
  const trades: Trade[] = [];
  const usedDates = new Set<string>();
  let id = 1;

  for (const day of SAMPLE_DAYS) {
    const d = new Date(now);
    d.setDate(d.getDate() - day.daysAgo);
    // Keep sample sessions on weekdays so the calendar looks like real trading,
    // and never double up on a date another sample day already claimed —
    // keep walking back until we land on a free weekday.
    let date = toDateKey(d);
    while (d.getDay() === 0 || d.getDay() === 6 || usedDates.has(date)) {
      d.setDate(d.getDate() - 1);
      date = toDateKey(d);
    }
    usedDates.add(date);

    for (const t of day.trades) {
      trades.push({
        id: `${SAMPLE_ID_PREFIX}${id++}`,
        date,
        symbol: t.symbol,
        pnl: t.pnl,
        setup: t.setup,
        side: t.side,
        notes: t.notes,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        mae: t.mae,
        mfe: t.mfe,
        rMultiple: t.rMultiple,
        accountId,
      });
    }
  }

  return trades;
}

export function isSampleTrade(trade: Trade): boolean {
  return trade.id.startsWith(SAMPLE_ID_PREFIX);
}
