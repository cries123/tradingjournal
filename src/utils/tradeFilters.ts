import type { Trade } from '../types';

/** Real broker fills that count toward account P&L and performance stats. */
export function isExecutedTrade(trade: Trade): boolean {
  return !trade.isGhost;
}

export function executedTrades(trades: Trade[]): Trade[] {
  return trades.filter(isExecutedTrade);
}

/** Missed / hypothetical trades — excluded from balance but tracked separately. */
export function ghostTrades(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.isGhost);
}

export function isFomoTrade(trade: Trade): boolean {
  return trade.psychology === 'FOMO' || trade.setup === 'FOMO';
}

export function fomoTrades(trades: Trade[]): Trade[] {
  return trades.filter(isFomoTrade);
}
