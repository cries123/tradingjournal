import type { Trade } from '../../types';

/*
 * The sample journal the landing page shows. Pure and deterministic, so the page reads the same on
 * every visit and in the prerendered snapshot, and so the arithmetic on it can be tested. What the
 * page does with it — June, the 4-trade cap, the day played back — is landingStory.ts.
 *
 * Every figure here is SAMPLE data and is labelled as such where it is shown. None of it describes
 * a real trader, and nothing here may be presented as a customer result.
 */

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
 * The sample journal's habits in figures: heavy days against light ones, and each day's first four
 * trades against the rest. landingStory.test.ts holds the story to these, so the two cannot drift.
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
