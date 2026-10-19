import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { weekDays } from './weekDays';

const t = (date: string, pnl: number): Trade => ({ id: `${date}${pnl}`, date, symbol: 'SPY', pnl });
// Monday, October 19 2026, at noon local time.
const monday = new Date(2026, 9, 19, 12);

describe('weekDays', () => {
  it('covers the last seven days, oldest first, without empty weekends', () => {
    const days = weekDays([], monday);
    expect(days.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19']);
    expect(days.map((d) => d.label)).toEqual(['Tue', 'Wed', 'Thu', 'Fri', 'Mon']);
  });

  it('adds each day up, and ignores trades outside the window', () => {
    const days = weekDays([t('2026-10-16', 100), t('2026-10-16', -30), t('2026-10-12', 999), t('2026-10-20', 999)], monday);
    expect(days.find((d) => d.date === '2026-10-16')).toMatchObject({ net: 70, trades: 2 });
    expect(days.reduce((s, d) => s + d.net, 0)).toBe(70);
  });

  it('keeps a weekend day that was traded', () => {
    const days = weekDays([t('2026-10-17', 40)], monday);
    expect(days.find((d) => d.date === '2026-10-17')).toMatchObject({ label: 'Sat', net: 40 });
  });

  it('agrees with the calendar day in every timezone the app runs in', () => {
    const tz = process.env.TZ;
    try {
      for (const zone of ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo']) {
        process.env.TZ = zone;
        const days = weekDays([t('2026-10-19', 10)], new Date(2026, 9, 19, 23, 30));
        expect(days.at(-1), zone).toMatchObject({ date: '2026-10-19', net: 10 });
      }
    } finally {
      process.env.TZ = tz;
    }
  });
});
