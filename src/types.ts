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
  /** Stable dedup key for trades imported from an external source (e.g. a broker sync), so
   *  re-syncing the same round-trip trade doesn't create a duplicate entry. Not set for
   *  manually-entered trades. */
  sourceId?: string;
  contract?: string;
  assetType?: AssetType;
  optionType?: OptionType;
  expiration?: string;
  strike?: number;
  quantity?: number;
  mark?: number;
  /** Entry (opening) execution price. */
  tradePrice?: number;
  /** Exit (closing) execution price — set for round-trip trades where open and close are known separately. */
  exitPrice?: number;
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
  /**
   * The date the position was OPENED, when the importer knew it.
   *
   * `date` is the closing fill on every imported trade — all three importers set it from the close —
   * so anything measuring from the open had nothing to read and silently used the exit instead. The
   * days-to-expiry panel did exactly that: a Friday-expiry option bought on Monday and closed on
   * Friday reported zero days to expiry and landed in the 0DTE row, under a heading that says "time
   * left when you opened".
   *
   * Optional because trades imported before this existed do not have it, and hand entry has only one
   * date. Readers fall back to `date` and are explicit about what that means.
   */
  openDate?: string;
  /** Max adverse / favorable excursion in $ */
  mae?: number;
  mfe?: number;
  rMultiple?: number;
  grade?: TradeGrade;
  /** 0–100 checklist adherence */
  checklistScore?: number;
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
