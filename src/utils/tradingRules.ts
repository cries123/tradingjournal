import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';

export interface RuleViolation {
  date: string;
  type: 'max_loss' | 'max_trades' | 'max_gain';
  message: string;
}

export function checkRuleViolations(
  trades: Trade[],
  rules: { enabled: boolean; maxDailyLoss?: number; maxTradesPerDay?: number; maxDailyGain?: number },
): RuleViolation[] {
  if (!rules.enabled) return [];

  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const list = byDay.get(t.date) ?? [];
    list.push(t);
    byDay.set(t.date, list);
  }

  const violations: RuleViolation[] = [];

  for (const [date, dayTrades] of byDay) {
    const dayPnl = dayTrades.reduce((s, t) => s + effectivePnl(t), 0);
    if (rules.maxDailyLoss != null && dayPnl <= -Math.abs(rules.maxDailyLoss)) {
      violations.push({ date, type: 'max_loss', message: `Daily loss ${dayPnl.toFixed(0)} exceeded limit` });
    }
    if (rules.maxDailyGain != null && dayPnl >= rules.maxDailyGain) {
      violations.push({ date, type: 'max_gain', message: `Daily gain ${dayPnl.toFixed(0)} exceeded target cap` });
    }
    if (rules.maxTradesPerDay != null && dayTrades.length > rules.maxTradesPerDay) {
      violations.push({
        date,
        type: 'max_trades',
        message: `${dayTrades.length} trades exceeded max ${rules.maxTradesPerDay}`,
      });
    }
  }

  return violations.sort((a, b) => b.date.localeCompare(a.date));
}
