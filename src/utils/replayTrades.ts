import type { Trade } from '../types';
import type { Right } from './marketReplay';

/** One contract to ask the server for, and the day's trades on it. */
export interface ReplayContractRequest {
  underlying: string;
  expiration: string;
  right: Right;
  strike: number;
  /** Fill prices, to tell SPX from SPXW. Empty for a contract picked by hand. */
  fills: number[];
}

export interface ReplayPlan {
  /** The equity drawn as the underlying: the most traded underlying of the day. */
  underlying: string | null;
  contracts: ReplayContractRequest[];
  /** Each of the day's trades against the contract it was on, or null for a share trade. */
  tradeContract: Map<string, number | null>;
}

const key = (c: Pick<ReplayContractRequest, 'underlying' | 'expiration' | 'right' | 'strike'>) =>
  `${c.underlying}|${c.expiration}|${c.right}|${c.strike}`;

/**
 * What to fetch for a day's trades: one entry per distinct option contract, with the fill prices
 * on it, and the underlying most of them were on.
 *
 * A trade without an expiration, strike or call/put cannot be turned into a contract (a CSV row
 * with a free-text description), and is left out rather than guessed at.
 */
export function replayPlan(trades: Trade[]): ReplayPlan {
  const contracts: ReplayContractRequest[] = [];
  const index = new Map<string, number>();
  const tradeContract = new Map<string, number | null>();
  const counts = new Map<string, number>();

  for (const t of trades) {
    const underlying = (t.symbol ?? '').trim().toUpperCase();
    if (underlying) counts.set(underlying, (counts.get(underlying) ?? 0) + 1);
    const right: Right | null = t.optionType === 'call' ? 'C' : t.optionType === 'put' ? 'P' : null;
    const expiration = t.expiration?.slice(0, 10) ?? '';
    if (t.assetType !== 'option' || !right || !/^\d{4}-\d{2}-\d{2}$/.test(expiration) || !(Number(t.strike) > 0)) {
      tradeContract.set(t.id, null);
      continue;
    }
    const c = { underlying, expiration, right, strike: Number(t.strike) };
    let i = index.get(key(c));
    if (i === undefined) {
      i = contracts.push({ ...c, fills: [] }) - 1;
      index.set(key(c), i);
    }
    for (const p of [t.tradePrice, t.exitPrice]) {
      if (typeof p === 'number' && Number.isFinite(p) && p > 0 && !contracts[i].fills.includes(p)) contracts[i].fills.push(p);
    }
    tradeContract.set(t.id, i);
  }

  const underlying = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { underlying, contracts, tradeContract };
}

/** The same contract, picked by hand on the replay: no fills to match. */
export function handPicked(underlying: string, date: string, right: Right, strike: number): ReplayContractRequest {
  return { underlying, expiration: date, right, strike, fills: [] };
}

export function sameContract(a: ReplayContractRequest, b: ReplayContractRequest): boolean {
  return key(a) === key(b);
}
