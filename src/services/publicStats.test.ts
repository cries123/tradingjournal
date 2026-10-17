import { describe, expect, it } from 'vitest';
import {
  publicFigures,
  readPublicCounts,
  roundDownForDisplay,
  TRADERS_FLOOR,
  TRADES_FLOOR,
  type CountingDb,
} from '../../server/publicStats';

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
    const out = publicFigures({ trades: TRADES_FLOOR - 1, traders: TRADERS_FLOOR - 1 }, NOW);
    expect(out.trades).toBeNull();
    expect(out.traders).toBeNull();
  });

  it('publishes a figure at or above its floor, rounded down', () => {
    const out = publicFigures({ trades: 12_437, traders: TRADERS_FLOOR }, NOW);
    expect(out.trades).toBe(12_000);
    expect(out.traders).toBe(TRADERS_FLOOR);
  });

  it('keeps a figure that could not be counted as unknown', () => {
    expect(publicFigures({ trades: null, traders: 5_000 }, NOW)).toEqual({
      trades: null,
      traders: 5_000,
      updatedAt: NOW.toISOString(),
    });
  });
});

describe('readPublicCounts', () => {
  const counter = (n: number | Error) => ({
    count: () => ({
      get: () => (n instanceof Error ? Promise.reject(n) : Promise.resolve({ data: () => ({ count: n }) })),
    }),
  });

  it('counts journal trades across every user, and users', async () => {
    const asked: string[] = [];
    const db: CountingDb = {
      collectionGroup: (id) => {
        asked.push(`group:${id}`);
        return counter(3_400);
      },
      collection: (path) => {
        asked.push(`collection:${path}`);
        return counter(260);
      },
    };
    expect(await readPublicCounts(db)).toEqual({ trades: 3_400, traders: 260 });
    expect(asked.sort()).toEqual(['collection:users', 'group:trades']);
  });

  it('lets one count fail without taking the other with it', async () => {
    const db: CountingDb = {
      collectionGroup: () => counter(new Error('FAILED_PRECONDITION: index')),
      collection: () => counter(260),
    };
    expect(await readPublicCounts(db)).toEqual({ trades: null, traders: 260 });
  });
});
