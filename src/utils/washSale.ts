import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';

const WASH_SALE_WINDOW_DAYS = 30;

export interface WashSaleMatch {
  lossTradeId: string;
  lossDate: string;
  symbol: string;
  lossAmount: number;
  disallowedLoss: number;
  replacementTradeId: string;
  replacementDate: string;
  daysApart: number;
}

function dayDiff(a: string, b: string): number {
  const ms = new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Detect wash sales: loss followed by repurchase of same symbol within ±30 days */
export function detectWashSales(trades: Trade[]): WashSaleMatch[] {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  const matches: WashSaleMatch[] = [];
  const matchedLossIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const loss = sorted[i];
    const pnl = effectivePnl(loss);
    if (pnl >= 0 || matchedLossIds.has(loss.id)) continue;

    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const rep = sorted[j];
      if (rep.symbol !== loss.symbol) continue;
      const apart = Math.abs(dayDiff(loss.date, rep.date));
      if (apart > WASH_SALE_WINDOW_DAYS) continue;
      if (rep.date < loss.date && dayDiff(rep.date, loss.date) > WASH_SALE_WINDOW_DAYS) continue;

      const repPnl = effectivePnl(rep);
      if (repPnl <= 0 && rep.side === loss.side) continue;

      matches.push({
        lossTradeId: loss.id,
        lossDate: loss.date,
        symbol: loss.symbol,
        lossAmount: pnl,
        disallowedLoss: Math.abs(pnl),
        replacementTradeId: rep.id,
        replacementDate: rep.date,
        daysApart: apart,
      });
      matchedLossIds.add(loss.id);
      break;
    }
  }

  return matches;
}

export function washSaleFlagByTradeId(trades: Trade[]): Map<string, WashSaleMatch> {
  const map = new Map<string, WashSaleMatch>();
  for (const m of detectWashSales(trades)) {
    map.set(m.lossTradeId, m);
  }
  return map;
}
