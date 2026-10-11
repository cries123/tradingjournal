import type { Trade } from '../../types';

/*
 * The sample data the landing page animates. Pure and deterministic, so the page reads the same on
 * every visit and in the prerendered snapshot, and so the arithmetic on it can be tested.
 *
 * Every figure here is SAMPLE data and is labelled as such where it is shown. None of it describes
 * a real trader, and nothing here may be presented as a customer result.
 */

/** A daily P&L for each trading day of the month, in order. Mostly green with honest red days. */
const DAY_PNL = [
  142, -88, 96, 210, -45, 321, 396, -359, 118, 64, -132, 188, 72, -61, 254, 133, -97, 167, 41, 226, -74, 158,
  89,
];

/** Trades per day, for the chips. Varies so the month does not look templated. */
const DAY_TRADES = [3, 5, 2, 4, 6, 5, 1, 8, 3, 2, 7, 4, 3, 5, 2, 4, 6, 3, 2, 5, 7, 3, 4];

/** How many of the month's last trading days arrive in the hero's "sync". */
export const SYNC_DAYS = 3;

export interface SampleDay {
  day: number;
  /** Null on a weekend or a day with no trades. */
  pnl: number | null;
  trades: number;
}

export interface SampleMonth {
  /** Blank cells before the 1st, Sunday-first like the app's calendar. */
  leading: number;
  days: SampleDay[];
  /** The last few trading days — empty until the hero's sync drops them in. */
  syncDays: number[];
}

/** The calendar for a real month: weekdays carry the sample P&L, weekends are empty. */
export function sampleMonth(year: number, month: number): SampleMonth {
  const leading = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days: SampleDay[] = [];
  const trading: number[] = [];

  for (let day = 1; day <= length; day++) {
    const weekday = (leading + day - 1) % 7;
    if (weekday === 0 || weekday === 6) {
      days.push({ day, pnl: null, trades: 0 });
      continue;
    }
    const i = trading.length % DAY_PNL.length;
    trading.push(day);
    days.push({ day, pnl: DAY_PNL[i], trades: DAY_TRADES[i] });
  }

  return { leading, days, syncDays: trading.slice(-SYNC_DAYS) };
}

export interface MonthStats {
  net: number;
  /** Green days as a percent of traded days. */
  winRate: number;
  avgPerDay: number;
  profitFactor: number;
  /** Green days in a row, counting back from the last traded day. */
  streak: number;
}

/** The chips under the calendar, computed from whichever days are showing. */
export function monthStats(days: SampleDay[]): MonthStats {
  const traded = days.filter((d): d is SampleDay & { pnl: number } => d.pnl !== null);
  if (traded.length === 0) return { net: 0, winRate: 0, avgPerDay: 0, profitFactor: 0, streak: 0 };

  const net = traded.reduce((s, d) => s + d.pnl, 0);
  const wins = traded.filter((d) => d.pnl > 0);
  const gross = wins.reduce((s, d) => s + d.pnl, 0);
  const lost = Math.abs(traded.filter((d) => d.pnl < 0).reduce((s, d) => s + d.pnl, 0));

  let streak = 0;
  for (let i = traded.length - 1; i >= 0 && traded[i].pnl > 0; i--) streak += 1;

  return {
    net,
    winRate: Math.round((wins.length / traded.length) * 100),
    avgPerDay: Math.round(net / traded.length),
    profitFactor: lost > 0 ? Math.round((gross / lost) * 100) / 100 : gross > 0 ? Infinity : 0,
    streak,
  };
}

/** The month as it shows after `revealed` of its sync days have arrived. */
export function visibleDays(month: SampleMonth, revealed: number): SampleDay[] {
  const pending = new Set(month.syncDays.slice(revealed));
  return month.days.map((d) => (pending.has(d.day) ? { ...d, pnl: null, trades: 0 } : d));
}

/* ------------------------------------------------------------------ rule simulator demo */

/**
 * Trades per day in the sample journal. A handful of overtrading days on purpose — that is the habit
 * the simulator exists to show the price of.
 */
const DEMO_COUNTS = [2, 4, 3, 11, 5, 1, 7, 14, 3, 2, 9, 4, 12, 2, 6, 3, 10, 5, 2, 8, 13, 4, 3, 6, 2, 11, 5, 3, 7, 4];

/** A small seeded generator, so the sample journal is identical on every load. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Thirty sample trading days, ordered within each day.
 *
 * The first few trades of a day lean positive and the later ones lean negative — the pattern of an
 * overtrader, which is what makes a trade cap worth testing. It is not tuned to flatter the cap:
 * a cap of one or two gives up real winners and the demo shows that too.
 */
export function demoJournal(): Trade[] {
  const rand = lcg(20260610);
  const trades: Trade[] = [];
  // Weekdays from a fixed Monday, so the dates are real calendar days.
  const start = Date.UTC(2026, 5, 1);
  let tradingDay = 0;
  for (let offset = 0; tradingDay < DEMO_COUNTS.length; offset++) {
    const date = new Date(start + offset * 86_400_000);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const iso = date.toISOString().slice(0, 10);
    const count = DEMO_COUNTS[tradingDay];
    for (let j = 0; j < count; j++) {
      const early = j < 4;
      const pnl = early ? 40 + rand() * 170 - 85 : -60 + rand() * 190 - 110;
      trades.push({
        id: `demo-${iso}-${String(j).padStart(2, '0')}`,
        date: iso,
        symbol: 'SPY',
        pnl: Math.round(pnl * 100) / 100,
      });
    }
    tradingDay += 1;
  }
  return trades;
}

export interface DemoInsights {
  heavyDays: number;
  heavyPnl: number;
  lightDays: number;
  lightPnl: number;
  /** Net of each day's first four trades, and of everything after them. */
  firstFourPnl: number;
  afterFourthPnl: number;
}

/** Heavy is eight trades or more in a day; light is four or fewer. */
export const HEAVY_DAY = 8;
export const LIGHT_DAY = 4;

/**
 * The figures the landing page's example assistant answer quotes — worked out from the sample
 * journal, so the answer and the panels beside it can never disagree.
 */
export function demoInsights(trades: Trade[]): DemoInsights {
  const byDay = new Map<string, Trade[]>();
  for (const t of trades) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);

  const out: DemoInsights = { heavyDays: 0, heavyPnl: 0, lightDays: 0, lightPnl: 0, firstFourPnl: 0, afterFourthPnl: 0 };
  for (const day of byDay.values()) {
    const ordered = [...day].sort((a, b) => a.id.localeCompare(b.id));
    const net = ordered.reduce((s, t) => s + t.pnl, 0);
    if (ordered.length >= HEAVY_DAY) {
      out.heavyDays += 1;
      out.heavyPnl += net;
    } else if (ordered.length <= LIGHT_DAY) {
      out.lightDays += 1;
      out.lightPnl += net;
    }
    ordered.forEach((t, i) => {
      if (i < 4) out.firstFourPnl += t.pnl;
      else out.afterFourthPnl += t.pnl;
    });
  }
  for (const k of ['heavyPnl', 'lightPnl', 'firstFourPnl', 'afterFourthPnl'] as const) {
    out[k] = Math.round(out[k] * 100) / 100;
  }
  return out;
}
