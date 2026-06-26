export type TradeSide = 'long' | 'short';
export type AssetType = 'stock' | 'option';
export type OptionType = 'call' | 'put';

export interface Trade {
  id: string;
  date: string;
  symbol: string;
  pnl: number;
  setup?: string;
  side?: TradeSide;
  notes?: string;
  accountId?: string;
  contract?: string;
  assetType?: AssetType;
  optionType?: OptionType;
  expiration?: string;
  strike?: number;
  quantity?: number;
  mark?: number;
  tradePrice?: number;
  pnlOpen?: number;
  netLiq?: number;
  underlyingPrice?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  accountType?: string;
  /** Pre-trade mindset — optional, editable after CSV/screenshot import. */
  psychology?: string;
  /** How closely the trade followed the plan (0–10). */
  ruleAdherence?: number;
  /** Session environment tags, e.g. FOMC, gap up. */
  marketContext?: string[];
  /** Missed / hypothetical trade — excluded from account P&L stats. */
  isGhost?: boolean;
}

export interface TradeBehaviorInput {
  psychology?: string;
  ruleAdherence?: number;
  marketContext?: string[];
  isGhost?: boolean;
}

export interface DailySummary {
  date: string;
  totalPnl: number;
  tradeCount: number;
  ghostCount: number;
  tags: string[];
  trades: Trade[];
}

export interface WeekSummary {
  weekIndex: number;
  totalPnl: number;
  tradeCount: number;
}

export interface Filters {
  symbol: string;
  setup: string;
  side: string;
}

export type ParsedTradeInput = Omit<Trade, 'id'>;
