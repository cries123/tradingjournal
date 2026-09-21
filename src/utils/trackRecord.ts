import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';
import { computeStats } from './stats';
import { tradesByDay } from './tradingRules';
import { resolveTradeAccountId } from './accounts';

/**
 * A record of results that somebody else has a reason to believe.
 *
 * The product's one genuine advantage here is that trades arrive through a read-only brokerage
 * connection rather than being typed — so it can say where a number came from. That claim is worth
 * exactly as much as the rule below is strict, and no more.
 *
 * ONLY TRADES THE BROKER SENT. A trade carries `sourceId` ("snaptrade:<open>:<close>") when it was
 * imported and nothing when it was entered by hand. Everything here counts the first kind and
 * ignores the second, and the published page states the number it ignored. One typed trade allowed
 * into these figures and the page is a brag with a tick next to it.
 *
 * NO PERCENTAGE RETURN, deliberately and permanently. Broker connections are read-only and never
 * expose balances — "never sees your balance" is on every broker card in the product — so account
 * size is a number the trader typed into Settings. A verified numerator over a self-reported
 * denominator is less honest than no percentage at all, because it looks audited.
 */

export interface TrackRecord {
  /** Trades the broker sent, which is every trade these figures are built from. */
  verifiedTrades: number;
  /** Hand-entered trades left out. Published, so the exclusion is visible rather than implied. */
  excludedTrades: number;
  /** Distinct brokerages the trades came from, for the page to name. */
  brokers: string[];
  firstDate: string | null;
  lastDate: string | null;
  tradingDays: number;
  /**
   * Journals holding at least one broker-imported trade, and how many of them this record
   * covers. A journal with none cannot contribute to a verified record either way, so it is
   * counted in neither — otherwise leaving a paper-trading journal out would look like hiding
   * something, and leaving it in would pad the excluded count with trades nobody claimed.
   */
  journalsEligible: number;
  journalsIncluded: number;

  netPnl: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  /** Largest peak-to-trough fall in cumulative P&L, by day. Negative or zero. */
  maxDrawdown: number;
  bestDay: number;
  worstDay: number;
}

export const EMPTY_RECORD: TrackRecord = {
  verifiedTrades: 0,
  excludedTrades: 0,
  brokers: [],
  firstDate: null,
  lastDate: null,
  tradingDays: 0,
  journalsEligible: 0,
  journalsIncluded: 0,
  netPnl: 0,
  winRate: 0,
  profitFactor: 0,
  avgWin: 0,
  avgLoss: 0,
  maxDrawdown: 0,
  bestDay: 0,
  worstDay: 0,
};

/**
 * The public document at trackRecords/<username>.
 *
 * Deliberately NOT `TrackRecord & { ... }`. The money fields are optional here because a trader
 * who published without amounts has a document that does not contain them at all — the page has to
 * be written against a shape where they can genuinely be missing, or it would render `$0` for
 * somebody who chose privacy and quietly report a loss they never had.
 */
export interface PublishedRecord {
  published: true;
  showAmounts: boolean;
  /**
   * The trader’s handle, as they typed it — the chosen name, never a real one.
   *
   * Firebase hands us a displayName from Google sign-in that is somebody’s legal name, and it
   * must never reach this document. Only the username does: a handle they picked, which is
   * already the address of the page, and which they can change.
   */
  username: string;
  verifiedTrades: number;
  excludedTrades: number;
  brokers: string[];
  firstDate: string | null;
  lastDate: string | null;
  tradingDays: number;
  /**
   * How many of the trader’s broker-connected journals this record covers.
   *
   * Published so that leaving one out is visible to a reader rather than only to the person who
   * left it out. Without it, "choose which journals to include" is cherry-picking with a
   * checkbox in front of it.
   */
  journalsEligible: number;
  journalsIncluded: number;
  winRate: number;
  profitFactor: number;
  /** ISO. The page dates itself by this — these are a snapshot, not a live feed. */
  updatedAt: string;

  netPnl?: number;
  avgWin?: number;
  avgLoss?: number;
  maxDrawdown?: number;
  bestDay?: number;
  worstDay?: number;
}

/**
 * True when the broker, not the trader, is the source of this row.
 *
 * THE GUARANTEE THIS GIVES IS BOUNDED, and the published page is worded to match. `sourceId` is
 * set only by the import path, and nothing in the product puts one on a hand-logged trade — so
 * this is a real answer to "did you type these in", which is what almost everyone means when they
 * ask whether a record is made up.
 *
 * What it is NOT is proof against a determined forgery. firestore.rules lets a signed-in user
 * write any field to their own trades (they have to: broker sync writes them from the browser),
 * so somebody working the Firebase SDK by hand could set a sourceId this function would accept.
 * That is why nothing on the published page claims a record cannot be faked — only that nothing
 * typed into the journal reaches it, which is true and enforced.
 *
 * Closing the gap properly means one of two things, neither of them a tweak here: re-checking
 * each trade against the brokerage feed when a record is published, or moving the import write
 * server-side so the rules can forbid a browser from ever setting sourceId. Weigh those before
 * strengthening any wording on the page.
 */
export function isBrokerVerified(trade: Trade): boolean {
  return typeof trade.sourceId === 'string' && trade.sourceId.length > 0;
}

/**
 * The journals that hold at least one broker-imported trade.
 *
 * The only journals this feature has anything to say about. A journal of hand-entered trades
 * contributes nothing to a verified record whether it is included or not, so it is not offered,
 * not counted, and cannot make a published page look narrower than it is.
 */
export function eligibleJournals(allTrades: Trade[]): string[] {
  return [
    ...new Set(
      allTrades.filter(isBrokerVerified).map((t) => resolveTradeAccountId(t.accountId)),
    ),
  ].sort();
}

/**
 * The brokerage a sourceId names, or null.
 *
 * Today every import is "snaptrade:…", which names the aggregator rather than the brokerage — so
 * this returns nothing useful yet and the page falls back to "a connected brokerage". It exists so
 * that when the import starts recording which institution a trade came from, the page gets more
 * specific without the shape of this record changing.
 */
function brokerOf(trade: Trade): string | null {
  const institution = (trade as { institution?: unknown }).institution;
  return typeof institution === 'string' && institution.trim() ? institution.trim() : null;
}

/**
 * Largest peak-to-trough fall in cumulative P&L, walked day by day.
 *
 * By day rather than by trade, because a drawdown measured trade-by-trade counts intraday swings
 * a position trader never experienced as an account decline — and with no fill times on most
 * journals here, the within-day order is not reliable enough to build a number somebody publishes.
 */
export function maxDrawdownByDay(trades: Trade[]): number {
  const days = [...tradesByDay(trades).entries()].sort(([a], [b]) => a.localeCompare(b));

  let running = 0;
  let peak = 0;
  let worst = 0;

  for (const [, dayTrades] of days) {
    running += dayTrades.reduce((sum, t) => sum + effectivePnl(t), 0);
    if (running > peak) peak = running;
    const fall = running - peak;
    if (fall < worst) worst = fall;
  }

  return worst;
}

/**
 * @param includedJournals account ids the record covers. Undefined means every eligible
 *   journal, which is the default a trader never has to think about.
 */
export function buildTrackRecord(
  allTrades: Trade[],
  includedJournals?: readonly string[] | null,
): TrackRecord {
  const eligible = eligibleJournals(allTrades);
  const included = includedJournals ? eligible.filter((j) => includedJournals.includes(j)) : eligible;

  /*
   * Scoped to the included journals BEFORE anything is counted, so that excludedTrades means
   * "typed into an account this record covers" rather than "typed in anywhere". A trader with a
   * separate paper journal was otherwise publishing a page that announced hundreds of
   * hand-entered trades against an account that had none.
   */
  const inScope = allTrades.filter((t) => included.includes(resolveTradeAccountId(t.accountId)));
  const verified = inScope.filter(isBrokerVerified);
  const excluded = inScope.length - verified.length;

  if (verified.length === 0) {
    return {
      ...EMPTY_RECORD,
      excludedTrades: excluded,
      journalsEligible: eligible.length,
      journalsIncluded: included.length,
    };
  }

  const stats = computeStats(verified);
  const wins = verified.map(effectivePnl).filter((p) => p > 0);
  const losses = verified.map(effectivePnl).filter((p) => p < 0);

  const dayTotals = [...tradesByDay(verified).entries()].map(([date, dayTrades]) => ({
    date,
    pnl: dayTrades.reduce((sum, t) => sum + effectivePnl(t), 0),
  }));
  const dates = dayTotals.map((d) => d.date).sort();

  return {
    verifiedTrades: verified.length,
    excludedTrades: excluded,
    brokers: [...new Set(verified.map(brokerOf).filter((b): b is string => b !== null))].sort(),
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    tradingDays: dayTotals.length,
    journalsEligible: eligible.length,
    journalsIncluded: included.length,

    netPnl: stats.netPnl,
    winRate: stats.winRate,
    profitFactor: stats.profitFactor,
    avgWin: wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0,
    // Kept negative, so the page never has to decide whether a minus sign belongs in front of it.
    avgLoss: losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
    maxDrawdown: maxDrawdownByDay(verified),
    bestDay: dayTotals.length > 0 ? Math.max(...dayTotals.map((d) => d.pnl)) : 0,
    worstDay: dayTotals.length > 0 ? Math.min(...dayTotals.map((d) => d.pnl)) : 0,
  };
}

/**
 * Below this there is nothing anybody should publish as a record.
 *
 * Thirty trades is not a track record, it is a month — and a page headed "verified" over a
 * fortnight's luck damages the idea more than it helps the trader. The number is a product
 * judgement rather than a statistical one, and it is stated to the user rather than enforced
 * silently.
 */
export const MIN_TRADES_TO_PUBLISH = 30;

export function canPublish(record: TrackRecord): boolean {
  return record.verifiedTrades >= MIN_TRADES_TO_PUBLISH;
}
