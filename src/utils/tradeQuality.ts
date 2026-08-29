import type { Trade } from '../types';
import { marketSessionFromTime } from './tradeHelpers';

/**
 * Analytics over the *execution quality* fields — MAE, MFE, R-multiple, and entry time.
 *
 * These fields are optional and mostly hand-entered, so every function here reports how many
 * trades it actually had to work with and returns null rather than a misleading zero when the
 * sample is too thin. A trader with three filled-in trades should not be told their capture rate
 * "is" 61%.
 */

/** Below this many usable trades we don't draw conclusions — the number would be noise. */
const MIN_SAMPLE = 3;

function usableNumber(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n !== 0;
}

export interface ExcursionInsights {
  /** Winners that had a usable MFE recorded. */
  winnerSample: number;
  /** What those winners actually banked. */
  captured: number;
  /** What they were worth at their peak. */
  peak: number;
  /** captured / peak, as a percentage — how much of the available move you kept. */
  captureRate: number;
  /** peak − captured: profit that existed on screen and was given back. */
  leftOnTable: number;
  /** Trades with a usable MAE recorded. */
  heatSample: number;
  /** Average drawdown endured on trades that ended up winning. */
  avgHeatOnWinners: number;
  /** Average drawdown endured on trades that ended up losing. */
  avgHeatOnLosers: number;
  /** Losers that were green at some point before being closed red. */
  roundTrips: number;
}

/**
 * MAE/MFE are entered as free-form dollar amounts, so users write adverse excursion as either
 * -120 or 120 depending on how they think about it. We take the magnitude of both and treat
 * direction as implied by the field's meaning, which makes the math correct either way.
 */
export function computeExcursionInsights(trades: Trade[]): ExcursionInsights | null {
  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl < 0);

  const withMfe = winners.filter((t) => usableNumber(t.mfe));
  const captured = withMfe.reduce((s, t) => s + t.pnl, 0);
  // Clamp to the realised P&L: an MFE below the exit price means the data is inconsistent
  // (you cannot bank more than the peak), and we'd otherwise report negative "left on table".
  const peak = withMfe.reduce((s, t) => s + Math.max(Math.abs(t.mfe as number), t.pnl), 0);

  const winnersWithMae = winners.filter((t) => usableNumber(t.mae));
  const losersWithMae = losers.filter((t) => usableNumber(t.mae));
  const heatSample = winnersWithMae.length + losersWithMae.length;

  // A loser whose MFE was positive was green at some point — the classic "gave back a winner".
  const roundTrips = losers.filter((t) => usableNumber(t.mfe) && Math.abs(t.mfe as number) > 0).length;

  if (withMfe.length < MIN_SAMPLE && heatSample < MIN_SAMPLE) return null;

  const avg = (list: Trade[]) =>
    list.length > 0 ? list.reduce((s, t) => s + Math.abs(t.mae as number), 0) / list.length : 0;

  return {
    winnerSample: withMfe.length,
    captured,
    peak,
    captureRate: peak > 0 ? (captured / peak) * 100 : 0,
    leftOnTable: Math.max(0, peak - captured),
    heatSample,
    avgHeatOnWinners: avg(winnersWithMae),
    avgHeatOnLosers: avg(losersWithMae),
    roundTrips,
  };
}

export interface RMultipleInsights {
  sample: number;
  /** Mean R across trades that recorded one — expectancy expressed in risk units. */
  avgR: number;
  best: number;
  worst: number;
  /** Share of trades that returned 2R or better. */
  bigWinRate: number;
  /** Share of trades that lost more than the 1R they were supposed to risk. */
  overRiskRate: number;
}

export function computeRMultipleInsights(trades: Trade[]): RMultipleInsights | null {
  const withR = trades.filter((t) => usableNumber(t.rMultiple));
  if (withR.length < MIN_SAMPLE) return null;

  const values = withR.map((t) => t.rMultiple as number);
  const total = values.reduce((s, v) => s + v, 0);

  return {
    sample: withR.length,
    avgR: total / values.length,
    best: Math.max(...values),
    worst: Math.min(...values),
    bigWinRate: (values.filter((v) => v >= 2).length / values.length) * 100,
    overRiskRate: (values.filter((v) => v < -1).length / values.length) * 100,
  };
}

export interface SessionResult {
  session: string;
  pnl: number;
  trades: number;
  winRate: number;
}

/** Order matters — this is chronological through the trading day, not alphabetical. */
const SESSION_ORDER = ['Premarket', 'Open', 'Midday', 'Close', 'After hours'];

/**
 * Groups trades by which part of the session they were entered in, reusing the same buckets
 * the trade detail view already labels trades with so the two never disagree.
 */
export function computeSessionPerformance(trades: Trade[]): SessionResult[] | null {
  const buckets = new Map<string, { pnl: number; trades: number; wins: number }>();

  for (const t of trades) {
    const session = marketSessionFromTime(t.entryTime);
    if (!session) continue;
    const entry = buckets.get(session) ?? { pnl: 0, trades: 0, wins: 0 };
    entry.pnl += t.pnl;
    entry.trades += 1;
    if (t.pnl > 0) entry.wins += 1;
    buckets.set(session, entry);
  }

  const totalTraded = [...buckets.values()].reduce((s, b) => s + b.trades, 0);
  if (totalTraded < MIN_SAMPLE) return null;

  return SESSION_ORDER.filter((s) => buckets.has(s)).map((session) => {
    const b = buckets.get(session)!;
    return {
      session,
      pnl: b.pnl,
      trades: b.trades,
      winRate: b.trades > 0 ? (b.wins / b.trades) * 100 : 0,
    };
  });
}

/** The single worst session bucket, when one is clearly worse than the rest — used for the takeaway line. */
export function worstSession(sessions: SessionResult[] | null): SessionResult | null {
  if (!sessions || sessions.length < 2) return null;
  const sorted = [...sessions].sort((a, b) => a.pnl - b.pnl);
  const worst = sorted[0];
  return worst.pnl < 0 && worst.trades >= 2 ? worst : null;
}

/**
 * Natural phrasing for a session name in a sentence. Traders say "the open" and "the close",
 * but "the midday" and "the premarket" read wrong — so the article is only added where it
 * belongs rather than being glued on unconditionally.
 */
export function sessionPhrase(session: string): string {
  const lower = session.toLowerCase();
  return lower === 'open' || lower === 'close' ? `the ${lower}` : lower;
}
