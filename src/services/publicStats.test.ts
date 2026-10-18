import { describe, expect, it } from 'vitest';
import {
  PNL_FLOOR,
  publicFigures,
  readPublicCounts,
  roundDownForDisplay,
  TRADERS_FLOOR,
  TRADES_FLOOR,
  type CountingDb,
} from '../../server/publicStats';
import { proofFigures } from '../components/landing/proofFigures';

const NOW = new Date('2026-10-17T12:00:00Z');

describe('roundDownForDisplay', () => {
  it('keeps two significant figures and never rounds up, so the "+" is always true', () => {
    expect(roundDownForDisplay(12_437)).toBe(12_000);
    expect(roundDownForDisplay(1_874)).toBe(1_800);
    expect(roundDownForDisplay(437)).toBe(430);
    expect(roundDownForDisplay(99)).toBe(99);
    expect(roundDownForDisplay(1_999_999)).toBe(1_900_000);
  });

  it('reads nonsense as nothing', () => {
    expect(roundDownForDisplay(0)).toBe(0);
    expect(roundDownForDisplay(-5)).toBe(0);
    expect(roundDownForDisplay(Number.NaN)).toBe(0);
  });
});

describe('publicFigures', () => {
  it('withholds a figure below its floor rather than advertising how small it is', () => {
    const out = publicFigures({ trades: TRADES_FLOOR - 1, traders: TRADERS_FLOOR - 1, pnl: PNL_FLOOR - 1 }, NOW);
    expect(out.trades).toBeNull();
    expect(out.traders).toBeNull();
    expect(out.pnl).toBeNull();
  });

  it('publishes a figure at or above its floor, rounded down', () => {
    const out = publicFigures({ trades: 12_437, traders: TRADERS_FLOOR, pnl: 48_612.37 }, NOW);
    expect(out.trades).toBe(12_000);
    expect(out.traders).toBe(TRADERS_FLOOR);
    expect(out.pnl).toBe(48_000);
  });

  it('never publishes a combined loss', () => {
    expect(publicFigures({ trades: 12_437, traders: 5_000, pnl: -31_000 }, NOW).pnl).toBeNull();
  });

  it('keeps a figure that could not be counted as unknown', () => {
    expect(publicFigures({ trades: null, traders: 5_000, pnl: null }, NOW)).toEqual({
      trades: null,
      traders: 5_000,
      pnl: null,
      updatedAt: NOW.toISOString(),
    });
  });
});

describe('readPublicCounts', () => {
  const settle = <T,>(v: T | Error) => (v instanceof Error ? Promise.reject(v) : Promise.resolve(v));
  const group = (n: number | Error, sum: number | Error) => ({
    count: () => ({ get: () => settle(n).then((count) => ({ data: () => ({ count }) })) }),
    aggregate: (spec: Record<string, unknown>) => ({
      get: () => settle(sum).then((pnl) => ({ data: () => ({ ...Object.fromEntries(Object.keys(spec).map((k) => [k, pnl])) }) })),
    }),
  });
  const counter = (n: number | Error) => ({
    count: () => ({ get: () => settle(n).then((count) => ({ data: () => ({ count }) })) }),
  });

  it('counts journal trades across every user, sums their P&L, and counts users', async () => {
    const asked: string[] = [];
    const db: CountingDb = {
      collectionGroup: (id) => {
        asked.push(`group:${id}`);
        return group(3_400, 48_612.37);
      },
      collection: (path) => {
        asked.push(`collection:${path}`);
        return counter(260);
      },
    };
    expect(await readPublicCounts(db)).toEqual({ trades: 3_400, traders: 260, pnl: 48_612.37 });
    expect([...new Set(asked)].sort()).toEqual(['collection:users', 'group:trades']);
  });

  it('lets one aggregation fail without taking the others with it', async () => {
    const db: CountingDb = {
      collectionGroup: () => group(3_400, new Error('FAILED_PRECONDITION: index')),
      collection: () => counter(260),
    };
    expect(await readPublicCounts(db)).toEqual({ trades: 3_400, traders: 260, pnl: null });
  });
});

describe('proofFigures', () => {
  const labels = (stats: Parameters<typeof proofFigures>[0]) => proofFigures(stats).map((f) => f.label);

  it('puts combined P&L in the trade count’s place once it is published', () => {
    const figures = proofFigures({ trades: 2_800, traders: 120, pnl: 48_000 });
    expect(figures.map((f) => f.key)).toEqual(['brokers', 'pnl', 'traders', 'price']);
    expect(figures[1]).toMatchObject({ prefix: '$', suffix: '+', value: 48_000 });
    expect(labels({ trades: 2_800, traders: 120, pnl: 48_000 })).not.toContain('trades journaled');
  });

  it('falls back to the trade count while the P&L is withheld', () => {
    expect(proofFigures({ trades: 2_800, traders: 120, pnl: null }).map((f) => f.key)).toEqual([
      'brokers',
      'trades',
      'traders',
      'price',
    ]);
  });

  it('fills the live places with fixed facts until the server answers', () => {
    expect(proofFigures(null).map((f) => f.key)).toEqual(['brokers', 'sync-price', 'read-only', 'price']);
    expect(proofFigures({ trades: null, traders: 120, pnl: null }).map((f) => f.key)).toEqual([
      'brokers',
      'traders',
      'sync-price',
      'price',
    ]);
  });
});
