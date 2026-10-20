import type { Trade } from '../types';
import { possibleFillTimes, type Bar } from './marketReplay';
import { tradeMinute } from './replayClock';

/** The timeframes the replay draws, in minutes. Minute data in, coarser candles out. */
export const TIMEFRAMES = [1, 5, 15] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Replay speeds: bars per second. One a second is TradingView's own default. */
export const SPEEDS = [1, 2, 5, 10] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * Where the replay cursor sits after starting on a candle: the LAST minute of that candle, so the
 * candle that was clicked is drawn whole, as TradingView does.
 */
export function cursorForCandle(candleTime: number, timeframe: Timeframe): number {
  return candleTime + (timeframe - 1) * 60;
}

/** One step forward: the next candle at this timeframe, or null at the end of the session. */
export function nextCursor(cursor: number, timeframe: Timeframe, sessionEnd: number): number | null {
  const next = cursor + timeframe * 60;
  return next < sessionEnd ? next : null;
}

/** The minute bars the replay has revealed: everything up to and including the cursor's minute. */
export function revealed(bars: Bar[], cursor: number | null): Bar[] {
  return cursor === null ? bars : bars.filter((b) => b.time <= cursor);
}

/** The price a practice fill happens at: the close of the last bar revealed. */
export function markPrice(bars: Bar[], cursor: number | null): number | null {
  const shown = revealed(bars, cursor);
  return shown.length > 0 ? shown[shown.length - 1].close : null;
}

/**
 * The trader's real fills on one instrument, where the broker sent a time.
 *
 * A long trade buys at entry and sells at exit; a short the other way round. Times after the
 * cursor are left out, so a replay does not show its own ending.
 */
export function actualFills(
  trades: Trade[],
  date: string,
  cursor: number | null,
): { time: number; side: 'buy' | 'sell'; text: string }[] {
  const out: { time: number; side: 'buy' | 'sell'; text: string }[] = [];
  for (const t of trades) {
    const short = t.side === 'short';
    const entry = tradeMinute(date, t.entryTime);
    const exit = tradeMinute(date, t.exitTime);
    if (entry !== null) out.push({ time: entry, side: short ? 'sell' : 'buy', text: `Your ${short ? 'sell' : 'buy'}${t.tradePrice != null ? ` @${t.tradePrice}` : ''}` });
    if (exit !== null) out.push({ time: exit, side: short ? 'buy' : 'sell', text: `Your ${short ? 'cover' : 'sell'}${t.exitPrice != null ? ` @${t.exitPrice}` : ''}` });
  }
  return cursor === null ? out : out.filter((f) => f.time <= cursor);
}

/**
 * The minutes where the trader's untimed fills could have happened, bucketed to the timeframe:
 * each fill price checked against each bar's range. An estimate, labelled as one on screen, and
 * only for trades the broker sent without a time.
 */
export function estimatedFillTimes(trades: Trade[], minuteBars: Bar[], timeframe: Timeframe, cursor: number | null): number[] {
  const times = new Set<number>();
  const size = timeframe * 60;
  for (const t of trades) {
    if (t.entryTime || t.exitTime) continue;
    for (const price of [t.tradePrice, t.exitPrice]) {
      for (const time of possibleFillTimes(minuteBars, price)) {
        if (cursor === null || time <= cursor) times.add(Math.floor(time / size) * size);
      }
    }
  }
  return [...times].sort((a, b) => a - b);
}

/**
 * A strike to start the contract picker on: at the money from the underlying's last price.
 *
 * SPX is drawn as SPY, so its suggestion is SPY times ten, rounded to SPX's five-point strikes, and
 * the picker says it is approximate. Everything else rounds to a whole dollar.
 */
export function suggestedStrike(underlyingPrice: number | null, optionUnderlying: string): number | null {
  if (underlyingPrice == null || !(underlyingPrice > 0)) return null;
  if (optionUnderlying === 'SPX' || optionUnderlying === 'SPXW') return Math.round((underlyingPrice * 10) / 5) * 5;
  return Math.round(underlyingPrice);
}

/** The strike step for the picker's arrows. */
export function strikeStep(optionUnderlying: string): number {
  return optionUnderlying === 'SPX' || optionUnderlying === 'SPXW' ? 5 : 1;
}
