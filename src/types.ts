export type TradeSide = 'long' | 'short';

export interface Trade {
  id: string;
  date: string;
  symbol: string;
  pnl: number;
  setup?: string;
  side?: TradeSide;
  notes?: string;
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
