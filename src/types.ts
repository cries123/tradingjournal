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
}

export type ParsedTradeInput = Omit<Trade, 'id'>;
