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

/**
 * What counts as "the same security" for the 30-day rule.
 *
 * The contract, not the underlying. This compared `symbol`, which for an option is the ticker — so
 * every SPY option was substantially identical to every other SPY option regardless of strike, expiry
 * or whether it was a call or a put.
 *
 * For a 0DTE trader, which is most of this app's users, that means any winner in the same underlying
 * within a month flags any loss: the detector fired on 100% of losses and the tax CSV stamped REVIEW
 * on every red row. A flag that fires on everything is noise, not the "look at this one" the module
 * is for. Matching the contract collapses it to the case that genuinely looks like a wash — the same
 * strike and expiry re-traded inside the window.
 *
 * Equities are unaffected: mapSnapTradeActivities sets contract to the underlying symbol for stock,
 * so the key is the ticker exactly as before.
 */
function securityKey(trade: Trade): string {
  return trade.contract?.trim() || trade.symbol;
}

/** Detect wash sales: a loss and a repurchase of the same contract within ±30 days. */
export function detectWashSales(trades: Trade[]): WashSaleMatch[] {
  const sorted = [...trades].sort(
    (a, b) => a.date.localeCompare(b.date) || securityKey(a).localeCompare(securityKey(b)),
  );
  const matches: WashSaleMatch[] = [];
  const matchedLossIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const loss = sorted[i];
    const pnl = effectivePnl(loss);
    if (pnl >= 0 || matchedLossIds.has(loss.id)) continue;

    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const rep = sorted[j];
      if (securityKey(rep) !== securityKey(loss)) continue;
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
