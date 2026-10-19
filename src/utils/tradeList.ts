import type { Trade } from '../types';
import { tradeTags } from './tradeHelpers';
import { tradeLine } from './tradeLine';

/**
 * The Trades page's filters and summary. Pure, so what "only days I broke a rule" or "no setup"
 * means is decided once and tested, not in a render.
 */
export type ResultFilter = 'all' | 'won' | 'lost';
export type KindFilter = 'all' | 'calls' | 'puts' | 'shares';
/** A setup name, '' for any, or NO_SETUP for trades with none. */
export const NO_SETUP = '__none__';

export interface TradeListFilters {
  query: string;
  result: ResultFilter;
  setup: string;
  kind: KindFilter;
  brokeOnly: boolean;
}

export const NO_FILTERS: TradeListFilters = { query: '', result: 'all', setup: '', kind: 'all', brokeOnly: false };

/** Does this trade's text — contract, symbol, setups, note — contain the search? */
function matches(trade: Trade, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const line = tradeLine(trade);
  return [trade.symbol, line.title, line.dated, trade.contract ?? '', trade.notes ?? '', ...tradeTags(trade)]
    .some((field) => field.toLowerCase().includes(q));
}

export function filterTradeList(trades: readonly Trade[], f: TradeListFilters, ruleDates: ReadonlySet<string>): Trade[] {
  return trades.filter((t) => {
    if (f.result === 'won' && !(t.pnl > 0)) return false;
    if (f.result === 'lost' && !(t.pnl < 0)) return false;
    if (f.kind === 'calls' && t.optionType !== 'call') return false;
    if (f.kind === 'puts' && t.optionType !== 'put') return false;
    if (f.kind === 'shares' && (t.optionType != null || t.assetType === 'option')) return false;
    const tags = tradeTags(t);
    if (f.setup === NO_SETUP && tags.length > 0) return false;
    if (f.setup && f.setup !== NO_SETUP && !tags.includes(f.setup)) return false;
    if (f.brokeOnly && !ruleDates.has(t.date)) return false;
    return matches(t, f.query);
  });
}

export interface TradeListSummary {
  count: number;
  won: number;
  lost: number;
  net: number;
  /** The worst single trade, or null with no losers. */
  biggestLoss: number | null;
  /** Days with a broken rule among the days shown, and the days shown. */
  brokeDays: number;
  days: number;
  /** Trades with no setup or tag — the ones the setup breakdowns cannot count. */
  untagged: number;
}

export function summarizeTradeList(trades: readonly Trade[], ruleDates: ReadonlySet<string>): TradeListSummary {
  const dates = new Set(trades.map((t) => t.date));
  let net = 0;
  let worst: number | null = null;
  for (const t of trades) {
    net += t.pnl;
    if (t.pnl < 0 && (worst === null || t.pnl < worst)) worst = t.pnl;
  }
  return {
    count: trades.length,
    won: trades.filter((t) => t.pnl > 0).length,
    lost: trades.filter((t) => t.pnl < 0).length,
    net,
    biggestLoss: worst,
    brokeDays: [...dates].filter((d) => ruleDates.has(d)).length,
    days: dates.size,
    untagged: trades.filter((t) => tradeTags(t).length === 0).length,
  };
}
