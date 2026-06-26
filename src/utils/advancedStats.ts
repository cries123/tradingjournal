import type { Trade, RoundTrip } from '../types';
import { effectivePnl, holdTimeMinutes, marketSessionFromTime, tradeTags } from './tradeHelpers';

export function buildRoundTrips(trades: Trade[]): RoundTrip[] {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const byGroup = new Map<string, Trade[]>();

  for (const trade of sorted) {
    const key = trade.roundTripId ?? `${trade.symbol}-${trade.date}-${trade.side ?? 'long'}`;
    const list = byGroup.get(key) ?? [];
    list.push(trade);
    byGroup.set(key, list);
  }

  return [...byGroup.entries()].map(([id, group]) => {
    const dates = group.map((t) => t.date).sort();
    const netPnl = group.reduce((s, t) => s + effectivePnl(t), 0);
    const maeVals = group.map((t) => t.mae).filter((v): v is number => v != null);
    const mfeVals = group.map((t) => t.mfe).filter((v): v is number => v != null);
    const rVals = group.map((t) => t.rMultiple).filter((v): v is number => v != null);
    const hold = group.map(holdTimeMinutes).find((v) => v != null) ?? null;

    return {
      id,
      symbol: group[0].symbol,
      side: group[0].side,
      openDate: dates[0],
      closeDate: dates[dates.length - 1],
      trades: group,
      netPnl,
      holdMinutes: hold,
      mae: maeVals.length ? Math.min(...maeVals) : null,
      mfe: mfeVals.length ? Math.max(...mfeVals) : null,
      rMultiple: rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null,
    };
  });
}

export interface EquityPoint {
  date: string;
  equity: number;
  dailyPnl: number;
}

export interface DrawdownStats {
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  peakEquity: number;
  recoveryDays: number | null;
}

export interface TagStat {
  tag: string;
  trades: number;
  netPnl: number;
  winRate: number;
  avgPnl: number;
}

export interface SessionStat {
  session: string;
  trades: number;
  netPnl: number;
  winRate: number;
}

export interface MonteCarloResult {
  medianEndingEquity: number;
  bestCase: number;
  worstCase: number;
  riskOfRuinPct: number;
}

export function buildEquityCurve(trades: Trade[]): EquityPoint[] {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + effectivePnl(t));
  }
  let equity = 0;
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dailyPnl]) => {
      equity += dailyPnl;
      return { date, equity, dailyPnl };
    });
}

export function computeDrawdown(curve: EquityPoint[]): DrawdownStats {
  if (curve.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPct: 0, currentDrawdown: 0, peakEquity: 0, recoveryDays: null };
  }

  let peak = curve[0].equity;
  let maxDd = 0;
  let maxDdPct = 0;
  let peakIdx = 0;
  let maxDdEndIdx = 0;

  for (let i = 0; i < curve.length; i++) {
    const eq = curve[i].equity;
    if (eq >= peak) {
      peak = eq;
      peakIdx = i;
    }
    const dd = peak - eq;
    if (dd > maxDd) {
      maxDd = dd;
      maxDdPct = peak > 0 ? (dd / peak) * 100 : 0;
      maxDdEndIdx = i;
    }
  }

  const last = curve[curve.length - 1];
  const runningPeak = Math.max(...curve.map((p) => p.equity));
  const currentDrawdown = runningPeak - last.equity;

  let recoveryDays: number | null = null;
  if (maxDd > 0 && maxDdEndIdx < curve.length - 1) {
    const peakAtDd = curve[peakIdx].equity;
    for (let j = maxDdEndIdx + 1; j < curve.length; j++) {
      if (curve[j].equity >= peakAtDd) {
        recoveryDays = j - maxDdEndIdx;
        break;
      }
    }
  }

  return {
    maxDrawdown: maxDd,
    maxDrawdownPct: maxDdPct,
    currentDrawdown,
    peakEquity: runningPeak,
    recoveryDays,
  };
}

export function computeTagStats(trades: Trade[]): TagStat[] {
  const map = new Map<string, { pnl: number; wins: number; count: number }>();

  for (const trade of trades) {
    const tags = tradeTags(trade);
    if (tags.length === 0) tags.push('UNTAGGED');
    for (const tag of tags) {
      const bucket = map.get(tag) ?? { pnl: 0, wins: 0, count: 0 };
      const pnl = effectivePnl(trade);
      bucket.pnl += pnl;
      bucket.count += 1;
      if (pnl > 0) bucket.wins += 1;
      map.set(tag, bucket);
    }
  }

  return [...map.entries()]
    .map(([tag, b]) => ({
      tag,
      trades: b.count,
      netPnl: b.pnl,
      winRate: b.count ? (b.wins / b.count) * 100 : 0,
      avgPnl: b.count ? b.pnl / b.count : 0,
    }))
    .sort((a, b) => b.netPnl - a.netPnl);
}

export function computeSessionStats(trades: Trade[]): SessionStat[] {
  const sessions = ['Premarket', 'Open', 'Midday', 'Close', 'After hours', 'Unknown'];
  const map = new Map<string, { pnl: number; wins: number; count: number }>();

  for (const s of sessions) map.set(s, { pnl: 0, wins: 0, count: 0 });

  for (const trade of trades) {
    const session = marketSessionFromTime(trade.entryTime) ?? 'Unknown';
    const bucket = map.get(session)!;
    const pnl = effectivePnl(trade);
    bucket.pnl += pnl;
    bucket.count += 1;
    if (pnl > 0) bucket.wins += 1;
  }

  return sessions
    .map((session) => {
      const b = map.get(session)!;
      return {
        session,
        trades: b.count,
        netPnl: b.pnl,
        winRate: b.count ? (b.wins / b.count) * 100 : 0,
      };
    })
    .filter((s) => s.trades > 0);
}

export function runMonteCarlo(trades: Trade[], simulations = 500, startingEquity = 0): MonteCarloResult {
  const pnls = trades.map(effectivePnl);
  if (pnls.length === 0) {
    return { medianEndingEquity: startingEquity, bestCase: startingEquity, worstCase: startingEquity, riskOfRuinPct: 0 };
  }

  const endings: number[] = [];
  let ruinCount = 0;

  for (let sim = 0; sim < simulations; sim++) {
    let equity = startingEquity;
    let ruined = false;
    for (let i = 0; i < pnls.length; i++) {
      const pick = pnls[Math.floor(Math.random() * pnls.length)];
      equity += pick;
      if (equity < -Math.abs(startingEquity) - 10000) {
        ruined = true;
        break;
      }
    }
    endings.push(equity);
    if (ruined) ruinCount += 1;
  }

  endings.sort((a, b) => a - b);
  return {
    medianEndingEquity: endings[Math.floor(endings.length / 2)],
    bestCase: endings[endings.length - 1],
    worstCase: endings[0],
    riskOfRuinPct: (ruinCount / simulations) * 100,
  };
}

export function totalFees(trades: Trade[]): number {
  return trades.reduce((s, t) => s + (t.fees ?? 0), 0);
}

export interface RuleViolation {
  date: string;
  type: 'max_loss' | 'max_trades' | 'max_gain';
  message: string;
}

export function checkRuleViolations(
  trades: Trade[],
  rules: { enabled: boolean; maxDailyLoss?: number; maxTradesPerDay?: number; maxDailyGain?: number },
): RuleViolation[] {
  if (!rules.enabled) return [];

  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const list = byDay.get(t.date) ?? [];
    list.push(t);
    byDay.set(t.date, list);
  }

  const violations: RuleViolation[] = [];

  for (const [date, dayTrades] of byDay) {
    const dayPnl = dayTrades.reduce((s, t) => s + effectivePnl(t), 0);
    if (rules.maxDailyLoss != null && dayPnl <= -Math.abs(rules.maxDailyLoss)) {
      violations.push({ date, type: 'max_loss', message: `Daily loss ${dayPnl.toFixed(0)} exceeded limit` });
    }
    if (rules.maxDailyGain != null && dayPnl >= rules.maxDailyGain) {
      violations.push({ date, type: 'max_gain', message: `Daily gain ${dayPnl.toFixed(0)} exceeded target cap` });
    }
    if (rules.maxTradesPerDay != null && dayTrades.length > rules.maxTradesPerDay) {
      violations.push({
        date,
        type: 'max_trades',
        message: `${dayTrades.length} trades exceeded max ${rules.maxTradesPerDay}`,
      });
    }
  }

  return violations.sort((a, b) => b.date.localeCompare(a.date));
}
