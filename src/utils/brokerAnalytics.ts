import type { Trade } from '../types';
import { effectivePnl } from './tradeHelpers';

/**
 * The analysis a broker sync can actually support.
 *
 * The execution panels (utils/executionAnalytics.ts) read fields somebody has to type: an entry
 * time, an R multiple, MAE and MFE, a grade. That was fine when the journal was hand-kept. It
 * stopped being fine the day broker sync shipped, because a Schwab feed carries none of them —
 * SnapTrade's activity rows for it have a date with no clock on it, so even the hour-of-day panel,
 * the one that was supposed to work for free, draws nothing. A trader with three hundred imported
 * trades opened a paid screen and found one panel out of six.
 *
 * Everything in this file is computed from what every synced trade already has: a date, a side, a
 * quantity, an entry and exit price, fees, and for options a strike and an expiry. None of it asks
 * the trader for anything. Several of these are also the findings that matter most — position
 * size, what happens after a loss, and how the day goes as the trade count climbs are the three
 * leaks a review usually finds, and not one of them needs a field to be filled in.
 *
 * As everywhere else here, a function returns null rather than a shape with zeroes in it when the
 * sample is too thin to mean anything. Nothing is worse on this screen than a confident number
 * drawn from four trades.
 */

/** Below this a "pattern" is noise. Same bar the execution panels use. */
export const MIN_SAMPLE = 5;

/** Comparisons between two groups need a sample on each side, not five between them. */
export const MIN_PER_GROUP = 3;

function net(trades: Trade[]): number {
  return trades.reduce((sum, t) => sum + effectivePnl(t), 0);
}

function winRateOf(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  return (trades.filter((t) => effectivePnl(t) > 0).length / trades.length) * 100;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/* ------------------------------------------------------------------ ordering */

/** "09:34" -> 574 minutes. Anything unparseable sorts as unknown. */
function minutesOfDay(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * The trades in the order they happened, as closely as the data allows.
 *
 * Date first, then the entry clock when there is one, then the order the caller had them in. That
 * last fallback is doing the real work for a Schwab import: with no time on any fill, the sequence
 * within a day is whatever the importer produced, and the importer walks the broker's activity
 * rows in order. It is not a guarantee, which is why the panels built on this talk about "the next
 * trade" rather than claiming a clock time — but it is the actual sequence far more often than not,
 * and the alternative is refusing to say anything about tilt to every synced trader alive.
 */
export function orderTrades(trades: Trade[]): Trade[] {
  return trades
    .map((trade, index) => ({ trade, index }))
    .sort((a, b) => {
      const byDate = a.trade.date.localeCompare(b.trade.date);
      if (byDate !== 0) return byDate;
      const at = minutesOfDay(a.trade.entryTime);
      const bt = minutesOfDay(b.trade.entryTime);
      if (at !== null && bt !== null && at !== bt) return at - bt;
      return a.index - b.index;
    })
    .map((entry) => entry.trade);
}

/** The ordered trades grouped by day, days in date order. */
export function tradingDays(trades: Trade[]): Trade[][] {
  const byDay = new Map<string, Trade[]>();
  for (const trade of orderTrades(trades)) {
    const list = byDay.get(trade.date) ?? [];
    list.push(trade);
    byDay.set(trade.date, list);
  }
  return [...byDay.values()];
}

/* ------------------------------------------------------------------ breakeven */

export interface BreakevenStats {
  covered: number;
  winRate: number;
  /** Average winner, as a positive number. */
  avgWin: number;
  /** Average loser, as a positive number. */
  avgLoss: number;
  /** avgWin ÷ avgLoss. Below 1 means the losses are bigger than the wins. */
  payoff: number;
  /** The win rate this payoff needs just to break even. */
  requiredWinRate: number;
  /** winRate − requiredWinRate. Negative is the whole problem, in one number. */
  gap: number;
}

/**
 * The win rate the trader's own payoff ratio demands.
 *
 * This is the single most useful thing that can be said to somebody looking at a losing expectancy
 * and a win rate they think is fine. "You win 37%" means nothing on its own; "you win 37% and your
 * average win against your average loss needs 44%" is the entire diagnosis, and it points at the
 * fix — either win more often or lose less per loss, and the number says which is further away.
 *
 * Needs winners and losers both. A period of nothing but wins has no breakeven to compute, and
 * pretending otherwise would divide by zero and call it insight.
 */
export function breakevenStats(trades: Trade[]): BreakevenStats | null {
  if (trades.length < MIN_SAMPLE) return null;

  const wins = trades.map(effectivePnl).filter((p) => p > 0);
  const losses = trades.map(effectivePnl).filter((p) => p < 0);
  if (wins.length === 0 || losses.length === 0) return null;

  const avgWin = mean(wins);
  const avgLoss = Math.abs(mean(losses));
  if (avgWin <= 0 || avgLoss <= 0) return null;

  const winRate = (wins.length / trades.length) * 100;
  const requiredWinRate = (avgLoss / (avgWin + avgLoss)) * 100;

  return {
    covered: trades.length,
    winRate,
    avgWin,
    avgLoss,
    payoff: avgWin / avgLoss,
    requiredWinRate,
    gap: winRate - requiredWinRate,
  };
}

/* ------------------------------------------------------------------ position size */

/**
 * What the position was worth going in.
 *
 * Quantity times entry price, times a hundred for an option because the quantity on an option
 * trade is contracts and the price is per share. `contractSize` wins when it is set, which is what
 * makes this survive a futures contract that is neither one nor a hundred.
 */
export function tradeNotional(trade: Trade): number | null {
  const qty = Math.abs(trade.quantity ?? 0);
  const price = trade.tradePrice;
  if (!qty || price == null || !Number.isFinite(price) || price <= 0) return null;
  const multiplier = trade.contractSize ?? (trade.assetType === 'option' ? 100 : 1);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  return qty * price * multiplier;
}

export interface SizingStats {
  covered: number;
  avgWinnerSize: number;
  avgLoserSize: number;
  /** Loser size ÷ winner size. Above 1 means the bigger bets are the losing ones. */
  ratio: number;
  /** Net P&L of the biggest quarter of positions, and of everything else. */
  biggestQuarterNet: number;
  biggestQuarterTrades: number;
  restNet: number;
  restTrades: number;
  /**
   * The same split per trade.
   *
   * The totals alone mislead on a journal where both halves lose: "biggest quarter -$3,040, rest
   * -$1,790" reads as the small trades being the bigger problem, when there are three times as
   * many of them and each large position is costing five times as much.
   */
  biggestQuarterPerTrade: number;
  restPerTrade: number;
}

/**
 * Whether the money goes on the trades that work.
 *
 * Almost nobody sizes evenly, and almost nobody knows which way they lean. Averaging the position
 * size of the winners against the losers answers it in one ratio: above 1 and the conviction
 * trades are the losing ones, which is a sizing problem wearing a strategy problem's clothes.
 *
 * The biggest-quarter split is the second half of the same question. A trader can size evenly on
 * average and still give the whole year back on the four days they went big.
 */
export function sizingStats(trades: Trade[]): SizingStats | null {
  const sized = trades
    .map((trade) => ({ trade, size: tradeNotional(trade), pnl: effectivePnl(trade) }))
    .filter((row): row is { trade: Trade; size: number; pnl: number } => row.size !== null);

  if (sized.length < MIN_SAMPLE) return null;

  const winners = sized.filter((r) => r.pnl > 0);
  const losers = sized.filter((r) => r.pnl < 0);
  if (winners.length < MIN_PER_GROUP || losers.length < MIN_PER_GROUP) return null;

  const avgWinnerSize = mean(winners.map((r) => r.size));
  const avgLoserSize = mean(losers.map((r) => r.size));
  if (avgWinnerSize <= 0) return null;

  const bySize = [...sized].sort((a, b) => b.size - a.size);
  const quarter = Math.max(1, Math.round(bySize.length / 4));
  const biggest = bySize.slice(0, quarter);
  const rest = bySize.slice(quarter);
  const biggestNet = biggest.reduce((sum, r) => sum + r.pnl, 0);
  const restNet = rest.reduce((sum, r) => sum + r.pnl, 0);

  return {
    covered: sized.length,
    avgWinnerSize,
    avgLoserSize,
    ratio: avgLoserSize / avgWinnerSize,
    biggestQuarterNet: biggestNet,
    biggestQuarterTrades: biggest.length,
    restNet,
    restTrades: rest.length,
    biggestQuarterPerTrade: biggest.length > 0 ? biggestNet / biggest.length : 0,
    restPerTrade: rest.length > 0 ? restNet / rest.length : 0,
  };
}

/* ------------------------------------------------------------------ tilt */

export interface TiltStats {
  afterLossAvg: number;
  afterLossCount: number;
  afterWinAvg: number;
  afterWinCount: number;
  /** afterLoss − afterWin. Negative means the trade after a loss is the expensive one. */
  delta: number;
}

/**
 * What the next trade is worth, depending on how the last one went.
 *
 * Same day only. A loss on Tuesday has nothing to do with Wednesday's first trade, and pairing
 * across the gap would turn "I had a bad week" into a claim about revenge trading. Within a
 * session the pairing is the point: the trade taken straight after a red one is where discipline
 * actually gets tested, and the difference between the two averages is the price of losing it.
 */
export function tiltStats(trades: Trade[]): TiltStats | null {
  const afterLoss: number[] = [];
  const afterWin: number[] = [];

  for (const day of tradingDays(trades)) {
    for (let i = 1; i < day.length; i++) {
      const previous = effectivePnl(day[i - 1]);
      const current = effectivePnl(day[i]);
      if (previous < 0) afterLoss.push(current);
      else if (previous > 0) afterWin.push(current);
    }
  }

  if (afterLoss.length < MIN_PER_GROUP || afterWin.length < MIN_PER_GROUP) return null;

  const afterLossAvg = mean(afterLoss);
  const afterWinAvg = mean(afterWin);

  return {
    afterLossAvg,
    afterLossCount: afterLoss.length,
    afterWinAvg,
    afterWinCount: afterWin.length,
    delta: afterLossAvg - afterWinAvg,
  };
}

/* ------------------------------------------------------------------ sequence */

export interface SequenceRow {
  label: string;
  trades: number;
  pnl: number;
  perTrade: number;
  winRate: number;
}

/**
 * How the day goes, trade by trade.
 *
 * The shape people expect is a first trade that pays for the day and a fourth that gives it back,
 * and it is usually right — but it is just as often the reverse, which is worth knowing before
 * anyone stops trading after two. Positions past the cap are pooled, since a row for the eleventh
 * trade of the day is one person's Tuesday, not a pattern.
 */
export function sequenceRows(trades: Trade[], cap = 4): SequenceRow[] {
  const buckets = new Map<number, Trade[]>();

  for (const day of tradingDays(trades)) {
    day.forEach((trade, index) => {
      const position = Math.min(index + 1, cap);
      const list = buckets.get(position) ?? [];
      list.push(trade);
      buckets.set(position, list);
    });
  }

  const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th', '5th'][n - 1] ?? `${n}th`;

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, xs]) => xs.length >= MIN_PER_GROUP)
    .map(([position, xs]) => ({
      label: position === cap ? `${ordinal(cap)}+` : ordinal(position),
      trades: xs.length,
      pnl: net(xs),
      perTrade: net(xs) / xs.length,
      winRate: winRateOf(xs),
    }));
}

/* ------------------------------------------------------------------ daily load */

export interface LoadRow {
  label: string;
  days: number;
  net: number;
  perDay: number;
  greenDays: number;
}

const LOAD_BUCKETS: { label: string; max: number }[] = [
  { label: '1–2 trades', max: 2 },
  { label: '3–5 trades', max: 5 },
  { label: '6–10 trades', max: 10 },
  { label: '11+ trades', max: Infinity },
];

/**
 * The day's result against how much was traded that day.
 *
 * Overtrading is the leak everyone suspects and nobody measures, and it measures cleanly: group
 * whole days by how many trades were in them and compare what the days were worth. A quiet day
 * that makes money and a busy one that loses it is the single clearest argument for a daily trade
 * cap that a journal can produce, and it needs no field anybody has to fill in.
 */
export function dailyLoadRows(trades: Trade[], minDaysPerBucket = 3): LoadRow[] {
  const days = tradingDays(trades);
  if (days.length < MIN_SAMPLE) return [];

  const buckets = LOAD_BUCKETS.map((bucket) => ({ ...bucket, days: [] as Trade[][] }));
  for (const day of days) {
    const bucket = buckets.find((b) => day.length <= b.max);
    bucket?.days.push(day);
  }

  return buckets
    .filter((b) => b.days.length >= minDaysPerBucket)
    .map((b) => {
      const totals = b.days.map((day) => net(day));
      return {
        label: b.label,
        days: b.days.length,
        net: totals.reduce((a, x) => a + x, 0),
        perDay: mean(totals),
        greenDays: totals.filter((x) => x > 0).length,
      };
    });
}

/* ------------------------------------------------------------------ expiry */

const DAY_MS = 86_400_000;

/** Whole days from the trade date to the expiry, or null when either is missing. */
export function daysToExpiry(trade: Trade): number | null {
  if (!trade.expiration || !trade.date) return null;
  const open = Date.parse(`${trade.date.slice(0, 10)}T00:00:00Z`);
  const expiry = Date.parse(`${trade.expiration.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(open) || !Number.isFinite(expiry)) return null;
  const days = Math.round((expiry - open) / DAY_MS);
  // A negative gap means the dates disagree — an expiry before the fill is bad data, not a trade.
  return days >= 0 ? days : null;
}

export interface ExpiryRow {
  label: string;
  trades: number;
  pnl: number;
  perTrade: number;
  winRate: number;
}

const EXPIRY_BUCKETS: { label: string; max: number }[] = [
  { label: '0DTE', max: 0 },
  { label: '1–7 days', max: 7 },
  { label: '8–30 days', max: 30 },
  { label: '31+ days', max: Infinity },
];

/**
 * Options grouped by how long they had left when the position was opened.
 *
 * For anyone trading same-day expiries this is the most important split there is, and the journal
 * has had the expiry date on every synced option trade since the day sync shipped. A trader who is
 * quietly profitable on weeklies and paying for it every Friday on 0DTE cannot see that anywhere
 * else in the product.
 */
export function expiryRows(trades: Trade[], minPerBucket = MIN_PER_GROUP): ExpiryRow[] {
  const dated = trades
    .map((trade) => ({ trade, dte: daysToExpiry(trade) }))
    .filter((row): row is { trade: Trade; dte: number } => row.dte !== null);

  if (dated.length < MIN_SAMPLE) return [];

  const buckets = EXPIRY_BUCKETS.map((bucket) => ({ ...bucket, trades: [] as Trade[] }));
  for (const row of dated) {
    const bucket = buckets.find((b) => row.dte <= b.max);
    bucket?.trades.push(row.trade);
  }

  return buckets
    .filter((b) => b.trades.length >= minPerBucket)
    .map((b) => ({
      label: b.label,
      trades: b.trades.length,
      pnl: net(b.trades),
      perTrade: net(b.trades) / b.trades.length,
      winRate: winRateOf(b.trades),
    }));
}

/* ------------------------------------------------------------------ instrument mix */

export interface InstrumentRow {
  label: string;
  trades: number;
  pnl: number;
  perTrade: number;
  winRate: number;
}

/** Calls, puts and shares as three separate businesses, because that is what they are. */
export function instrumentRows(trades: Trade[], minPerRow = MIN_PER_GROUP): InstrumentRow[] {
  const groups = new Map<string, Trade[]>();
  const put = (label: string, trade: Trade) => {
    const list = groups.get(label) ?? [];
    list.push(trade);
    groups.set(label, list);
  };

  for (const trade of trades) {
    if (trade.assetType === 'option') {
      if (trade.optionType === 'call') put('Calls', trade);
      else if (trade.optionType === 'put') put('Puts', trade);
      else put('Options', trade);
    } else if (trade.assetType === 'stock') {
      put('Shares', trade);
    }
  }

  const order = ['Calls', 'Puts', 'Options', 'Shares'];
  return [...groups.entries()]
    .filter(([, xs]) => xs.length >= minPerRow)
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([label, xs]) => ({
      label,
      trades: xs.length,
      pnl: net(xs),
      perTrade: net(xs) / xs.length,
      winRate: winRateOf(xs),
    }));
}

/* ------------------------------------------------------------------ cost */

export interface CostStats {
  covered: number;
  fees: number;
  perTrade: number;
  /** Gross profit before costs, from the winning trades. */
  grossProfit: number;
  /** Fees as a share of that gross profit, in percent. */
  shareOfGross: number;
  net: number;
}

/**
 * What trading cost, next to what it made.
 *
 * The journal has stored commissions on every synced trade from the beginning and never shown
 * them to anybody. For an active options trader they are frequently the difference between a
 * profitable year and a flat one, and "commissions were 31% of your gross profit" is a sentence
 * that changes how somebody trades in a way no P&L figure does.
 */
export function costStats(trades: Trade[]): CostStats | null {
  const withFees = trades.filter((t) => typeof t.fees === 'number' && t.fees > 0);
  if (withFees.length < MIN_SAMPLE) return null;

  const fees = withFees.reduce((sum, t) => sum + (t.fees ?? 0), 0);
  if (fees <= 0) return null;

  const grossProfit = trades
    .map((t) => (t.grossPnl != null ? t.grossPnl : effectivePnl(t) + (t.fees ?? 0)))
    .filter((g) => g > 0)
    .reduce((a, b) => a + b, 0);

  return {
    covered: withFees.length,
    fees,
    perTrade: fees / withFees.length,
    grossProfit,
    shareOfGross: grossProfit > 0 ? (fees / grossProfit) * 100 : 0,
    net: net(trades),
  };
}

/* ------------------------------------------------------------------ coverage */

export interface BrokerCoverage {
  breakeven: BreakevenStats | null;
  sizing: SizingStats | null;
  tilt: TiltStats | null;
  sequence: SequenceRow[];
  load: LoadRow[];
  expiry: ExpiryRow[];
  instruments: InstrumentRow[];
  cost: CostStats | null;
}

/** Everything at once, so a caller can ask "is there anything to show?" with one call. */
export function brokerCoverage(trades: Trade[]): BrokerCoverage {
  return {
    breakeven: breakevenStats(trades),
    sizing: sizingStats(trades),
    tilt: tiltStats(trades),
    sequence: sequenceRows(trades),
    load: dailyLoadRows(trades),
    expiry: expiryRows(trades),
    instruments: instrumentRows(trades),
    cost: costStats(trades),
  };
}

export function hasAnyBrokerData(coverage: BrokerCoverage): boolean {
  return Boolean(
    coverage.breakeven ||
      coverage.sizing ||
      coverage.tilt ||
      coverage.cost ||
      coverage.sequence.length > 0 ||
      coverage.load.length > 0 ||
      coverage.expiry.length > 0 ||
      coverage.instruments.length > 1,
  );
}
