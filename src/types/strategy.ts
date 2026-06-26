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
  maxDailyGain?: number;
}

export const DEFAULT_TRADING_RULES: TradingRules = {
  enabled: false,
  maxDailyLoss: 500,
  maxTradesPerDay: 5,
};
