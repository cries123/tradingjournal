export type TradeSide = 'long' | 'short';
export type AssetType = 'stock' | 'option';
export type OptionType = 'call' | 'put';
export type TradeGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type AssetClass = 'stock' | 'option' | 'future' | 'forex' | 'crypto';

export interface Trade {
  id: string;
  date: string;
  symbol: string;
  pnl: number;
  /** ISO timestamp when this trade was last saved to cloud storage. */
  savedAt?: string;
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
  /** Multiple setup/strategy tags */
  tags?: string[];
  strategyId?: string;
  /** Commissions & fees (subtracted from gross for net pnl when grossPnl set) */
  fees?: number;
  grossPnl?: number;
  entryTime?: string;
  exitTime?: string;
  /** Max adverse / favorable excursion in $ */
  mae?: number;
  mfe?: number;
  rMultiple?: number;
  grade?: TradeGrade;
  /** 0–100 checklist adherence */
  checklistScore?: number;
  /** Base64 JPEG chart screenshots */
  imageUrls?: string[];
  /** TradingView or external chart replay URL */
  chartUrl?: string;
  roundTripId?: string;
  assetClass?: AssetClass;
  tickValue?: number;
  contractSize?: number;
  ivRank?: number;
}

export interface DailySummary {
  date: string;
  totalPnl: number;
  tradeCount: number;
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
  tag: string;
}

export type ParsedTradeInput = Omit<Trade, 'id'>;
