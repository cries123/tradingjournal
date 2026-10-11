import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { computeStats, getMonthTrades, type TradingStats } from './stats';
import { computeTradingInsights, type TradingInsights } from './insights';
import { aggregateTradesByDay, buildCalendarWeeks } from './calendar';
import { directionSplit, type DirectionSplit } from './directionRows';
import { breakevenWinRate } from './metricVerdict';
import { checkRuleViolations, type RuleViolation } from './tradingRules';
import { effectivePnl } from './tradeHelpers';
import { formatMonthYear } from './format';

/**
 * Everything the monthly report prints, worked out in one place from the same functions the
 * screens use — computeStats for the hero figures, the calendar's own day and week totals,
 * directionSplit for the direction card — so the PDF cannot disagree with the Overview it came
 * from. The component that draws it does no arithmetic of its own.
 */

export interface ReportDay {
  /** Day of the month, or null for the blank cells before the 1st and after the last day. */
  day: number | null;
  pnl: number | null;
  trades: number;
}

export interface ReportWeek {
  days: ReportDay[];
  pnl: number;
  trades: number;
}

export interface ReportSymbol {
  symbol: string;
  trades: number;
  winRate: number;
  pnl: number;
}

export interface ReportWeekday {
  label: string;
  days: number;
  pnl: number;
}

export interface MonthlyReport {
  label: string;
  /** Which journal the figures are from — a name, or "All journals". */
  scope: string;
  hasTrades: boolean;
  stats: TradingStats;
  insights: TradingInsights | null;
  /** The win rate the trader's own average win and loss require; null without both. */
  breakeven: number | null;
  fees: number;
  weeks: ReportWeek[];
  direction: DirectionSplit;
  symbols: ReportSymbol[];
  weekdays: ReportWeekday[];
  /** Null when breaches are not checked: rules off, or every journal added together. */
  violations: RuleViolation[] | null;
}

/** The most symbols listed. A month of 0DTE is two or three tickers; a stock picker's can be forty. */
export const REPORT_MAX_SYMBOLS = 10;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildMonthlyReport(input: {
  trades: Trade[];
  year: number;
  month: number;
  scope: string;
  rules?: TradingRules;
  /**
   * True in the all-journals view. Breaches are not reported there: a limit is set for one
   * account, and adding two journals' trades into one day reports breaches neither had — the
   * same reason the dashboard's breach list stands aside in that view.
   */
  allJournals?: boolean;
}): MonthlyReport {
  const { year, month } = input;
  const monthTrades = getMonthTrades(input.trades, year, month);
  const stats = computeStats(monthTrades);
  const insights = monthTrades.length ? computeTradingInsights(monthTrades) : null;
  const hasBothSides = stats.winningTrades > 0 && stats.losingTrades > 0;

  const summaries = aggregateTradesByDay(monthTrades);
  const weeks = buildCalendarWeeks(year, month, summaries).map((week) => ({
    days: week.days.slice(0, 7).map((d) => ({
      day: d.date?.getDate() ?? null,
      pnl: d.summary && d.summary.tradeCount > 0 ? d.summary.totalPnl : null,
      trades: d.summary?.tradeCount ?? 0,
    })),
    pnl: week.summary.totalPnl,
    trades: week.summary.tradeCount,
  }));

  const bySymbol = new Map<string, Trade[]>();
  for (const t of monthTrades) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);
  const symbols = [...bySymbol.entries()]
    .map(([symbol, xs]) => ({
      symbol,
      trades: xs.length,
      winRate: (xs.filter((t) => effectivePnl(t) > 0).length / xs.length) * 100,
      pnl: xs.reduce((sum, t) => sum + effectivePnl(t), 0),
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, REPORT_MAX_SYMBOLS);

  // By weekday, from the calendar's own day totals, so a weekday row adds up to its days.
  const weekdayTotals = WEEKDAY_LABELS.map((label) => ({ label, days: 0, pnl: 0 }));
  for (const [date, summary] of summaries) {
    if (summary.tradeCount === 0) continue;
    const [y, m, d] = date.split('-').map(Number);
    const row = weekdayTotals[new Date(y, m - 1, d).getDay()];
    row.days += 1;
    row.pnl += summary.totalPnl;
  }

  const checkRules = Boolean(input.rules?.enabled) && !input.allJournals;

  return {
    label: formatMonthYear(year, month),
    scope: input.scope,
    hasTrades: monthTrades.length > 0,
    stats,
    insights,
    breakeven: hasBothSides ? breakevenWinRate(stats.avgRR, 1) : null,
    fees: monthTrades.reduce((sum, t) => sum + (t.fees ?? 0), 0),
    weeks,
    direction: directionSplit(monthTrades),
    symbols,
    // Only the days that were traded — a report listing "Sat · 0 days" is filler.
    weekdays: weekdayTotals.filter((w) => w.days > 0),
    violations: checkRules && input.rules ? checkRuleViolations(monthTrades, input.rules) : null,
  };
}
