import { describe, expect, it } from 'vitest';
import type { DailySummary } from '../types';
import { filledDays, nextDaySeen } from './freshDays';

const summary = (tradeCount: number): DailySummary => ({ totalPnl: 0, tradeCount, trades: [] }) as unknown as DailySummary;

describe('filledDays', () => {
  it('keeps only the shown month, and only days that have a trade', () => {
    const days = filledDays(
      new Map([
        ['2026-07-01', summary(2)],
        ['2026-07-02', summary(0)],
        ['2026-08-01', summary(1)],
        // A key that merely starts with the month's digits must not count as that month.
        ['2026-071', summary(1)],
      ]),
      2026,
      6,
    );
    expect([...days]).toEqual(['2026-07-01']);
  });
});

describe('nextDaySeen', () => {
  const set = (...days: string[]) => new Set(days);

  it('pops nothing when the calendar first appears', () => {
    // Opening the dashboard is not news. Every filled day popping on load would be.
    const seen = nextDaySeen(null, '2026-07', set('2026-07-01', '2026-07-02'));
    expect(seen.fresh.size).toBe(0);
  });

  it('pops the days a sync adds to the month on screen', () => {
    const first = nextDaySeen(null, '2026-07', set('2026-07-01'));
    const after = nextDaySeen(first, '2026-07', set('2026-07-01', '2026-07-29', '2026-07-31'));
    expect([...after.fresh].sort()).toEqual(['2026-07-29', '2026-07-31']);
  });

  it('does not pop a day that was already filled and gained another trade', () => {
    const first = nextDaySeen(null, '2026-07', set('2026-07-01'));
    // A new Set with the same contents — what a re-aggregation after a trade edit produces.
    const after = nextDaySeen(first, '2026-07', set('2026-07-01'));
    expect(after.fresh.size).toBe(0);
  });

  it('pops nothing when the month changes, however different the days are', () => {
    const july = nextDaySeen(null, '2026-07', set('2026-07-01'));
    const august = nextDaySeen(july, '2026-08', set('2026-08-03', '2026-08-04'));
    expect(august.fresh.size).toBe(0);
    expect(august.monthKey).toBe('2026-08');
  });

  it('stops popping a day once the next change has come and gone', () => {
    const first = nextDaySeen(null, '2026-07', set('2026-07-01'));
    const synced = nextDaySeen(first, '2026-07', set('2026-07-01', '2026-07-02'));
    const edited = nextDaySeen(synced, '2026-07', set('2026-07-01', '2026-07-02'));
    expect(edited.fresh.size).toBe(0);
  });

  it('returns the same record when nothing changed, so the calendar does not re-render for it', () => {
    const days = set('2026-07-01');
    const first = nextDaySeen(null, '2026-07', days);
    expect(nextDaySeen(first, '2026-07', days)).toBe(first);
  });
});
