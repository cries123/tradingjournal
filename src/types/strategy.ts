export interface Strategy {
  id: string;
  name: string;
  description?: string;
  criteria: string[];
  defaultTags: string[];
}

export interface TradingRules {
  enabled: boolean;
  maxDailyLoss?: number;
  maxTradesPerDay?: number;
  /**
   * Stop once the day is up this much.
   *
   * Has been in this type, in checkRuleViolations and in ruleStandingToday since rules shipped,
   * with no field in Settings to set it — a rule the product enforces and nobody could turn on.
   */
  maxDailyGain?: number;
  /**
   * Stop for the day after this many losers back to back.
   *
   * The one discipline rule that is about the sequence rather than the total, and the one traders
   * ask for most: three losses in a row is a different signal from three losses spread across a
   * good day. Needs only the order of the day's trades and the sign of each result, so it works on
   * a Schwab import with no fill times — unlike anything keyed on the clock.
   */
  maxConsecutiveLosses?: number;
}

export const DEFAULT_TRADING_RULES: TradingRules = {
  enabled: false,
  maxDailyLoss: 500,
  maxTradesPerDay: 5,
};
