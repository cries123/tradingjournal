import type { Trade } from '../types';

/**
 * A trade as one line of a log: "SPY 560C" with a "0DTE" tag, rather than the symbol alone.
 *
 * Options are most of this journal's trades and "SPY" twenty times in a column says nothing about
 * which of the twenty this is. Strike and right identify the contract; days to expiry, counted from
 * the day it was opened (the closing date when the importer did not know the open), is the thing a
 * 0DTE trader scans for.
 */
export interface TradeLine {
  /** "SPY 560C", "SPY 558P", or the symbol for anything that is not an option with a strike. */
  title: string;
  /** "SPY 28 Sep 560C" — the title with the expiry date in it, for a table with room. */
  dated: string;
  /** "0DTE", "3DTE", or null when there is no expiry or it is more than a week out. */
  expiry: string | null;
  kind: 'call' | 'put' | 'other';
  /** "Long" or "Short", when the trade says. */
  side: string | null;
}

/** Whole days between two YYYY-MM-DD dates, in calendar days rather than 24-hour spans. */
function daysBetween(from: string, to: string): number | null {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Strikes print as traded: 560, 557.5 — never 560.00. */
function strikeText(strike: number): string {
  return Number.isInteger(strike) ? String(strike) : String(Number(strike.toFixed(2)));
}

export function tradeLine(trade: Partial<Trade>): TradeLine {
  const symbol = trade.symbol ?? '';
  const kind = trade.optionType === 'call' ? 'call' : trade.optionType === 'put' ? 'put' : 'other';
  const title =
    kind !== 'other' && trade.strike != null && Number.isFinite(trade.strike)
      ? `${symbol} ${strikeText(trade.strike)}${kind === 'call' ? 'C' : 'P'}`
      : symbol;

  let expiry: string | null = null;
  if (kind !== 'other' && trade.expiration) {
    const opened = trade.openDate ?? trade.date;
    const days = opened ? daysBetween(opened.slice(0, 10), trade.expiration.slice(0, 10)) : null;
    if (days != null && days >= 0 && days <= 7) expiry = `${days}DTE`;
  }

  const side = trade.side ? trade.side.charAt(0).toUpperCase() + trade.side.slice(1) : null;
  let dated = title;
  if (title !== symbol && trade.expiration && /^\d{4}-\d{2}-\d{2}/.test(trade.expiration)) {
    const day = Number(trade.expiration.slice(8, 10));
    const mon = new Date(Date.UTC(2000, Number(trade.expiration.slice(5, 7)) - 1, 15)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    dated = `${symbol} ${day} ${mon} ${title.slice(symbol.length + 1)}`;
  }
  return { title, dated, expiry, kind, side };
}
