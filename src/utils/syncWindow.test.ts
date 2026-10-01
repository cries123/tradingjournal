import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { OVERLAP_DAYS, syncStartDate } from './syncWindow';

/*
 * How much history a sync asks for.
 *
 * Every manual sync pulled the whole account, every time, because the client never passed a start
 * date — up to 25 serial pages for somebody checking today's fills. That length is what broke it:
 * a phone that locks mid-request hands back a truncated body and the sync is lost. It is also why
 * the usual outcome was the entire history coming back, de-duplicating to nothing, and the screen
 * saying "you're up to date" about a sync that had just cost one of five.
 *
 * The dangerous direction here is narrowing too far. A window that misses real fills is worse than
 * one that is wider than it needs to be, because the overlap costs nothing — dedupe drops anything
 * already held — and a gap costs trades.
 */

let seq = 0;
const trade = (over: Partial<Trade> = {}): Trade =>
  ({
    id: `t${seq++}`,
    date: '2026-09-20',
    symbol: 'SPY',
    pnl: 10,
    accountId: 'schwab',
    sourceId: `snaptrade:o${seq}:c${seq}`,
    ...over,
  }) as Trade;

const TODAY = new Date(2026, 8, 30); // 30 Sep 2026, local

describe('syncStartDate', () => {
  it('asks for everything when the journal is empty', () => {
    // A first sync must pull the whole history, or somebody connects a broker, presses Sync, and
    // stays empty.
    expect(syncStartDate([], 'schwab', TODAY)).toBeUndefined();
  });

  it('asks for everything when this account has nothing imported yet', () => {
    // Another account's trades say nothing about this one.
    const other = [trade({ accountId: 'robinhood' })];
    expect(syncStartDate(other, 'schwab', TODAY)).toBeUndefined();
  });

  it('asks for everything when the only trades here were typed in', () => {
    /*
     * The trap. A hand-entered trade is not evidence the brokerage has sent anything, so treating
     * it as a high-water mark would narrow the window on a journal that has imported nothing — and
     * silently skip every real fill before it.
     */
    const typed = [trade({ sourceId: undefined }), trade({ sourceId: '' })];
    expect(syncStartDate(typed, 'schwab', TODAY)).toBeUndefined();
  });

  it('walks back from the newest imported trade, not from today', () => {
    const held = [trade({ date: '2026-09-20' }), trade({ date: '2026-09-18' })];

    // 20 Sep minus 14 days.
    expect(syncStartDate(held, 'schwab', TODAY)).toBe('2026-09-06');
  });

  it('widens the window for somebody returning after a long absence', () => {
    /*
     * The reason the anchor is the data and not the clock. Counting back from today would hand a
     * returning trader a fortnight and skip the three months in between — they would sync, see
     * almost nothing, and conclude the import is broken.
     */
    const held = [trade({ date: '2026-06-01' })];
    expect(syncStartDate(held, 'schwab', TODAY)).toBe('2026-05-18');
  });

  it('overlaps by enough to cover a weekend and a late feed', () => {
    // Schwab's feed arrives a day late and trades get amended after the fact, so the window has to
    // reach back past the last thing we hold rather than starting at it.
    const held = [trade({ date: '2026-09-20' })];
    const start = syncStartDate(held, 'schwab', TODAY)!;

    expect(new Date(start) < new Date('2026-09-20')).toBe(true);
    expect(OVERLAP_DAYS).toBeGreaterThanOrEqual(7);
  });

  it('counts only this account, so a busy second broker cannot narrow a quiet one', () => {
    const held = [
      trade({ accountId: 'robinhood', date: '2026-09-29' }),
      trade({ accountId: 'schwab', date: '2026-07-01' }),
    ];

    expect(syncStartDate(held, 'schwab', TODAY)).toBe('2026-06-17');
  });

  it('treats a missing accountId as the legacy journal', () => {
    // Trades predate journals; resolveTradeAccountId maps a missing id onto 'default'.
    const held = [trade({ accountId: undefined, date: '2026-09-20' })];
    expect(syncStartDate(held, 'default', TODAY)).toBe('2026-09-06');
  });

  it('never asks for a start date in the future', () => {
    // Brokers do send trades dated ahead of today around settlement; a window starting after the
    // range ends would come back empty and look like a broken sync.
    const held = [trade({ date: '2027-01-01' })];
    expect(syncStartDate(held, 'schwab', TODAY)).toBe('2026-09-30');
  });

  it('ignores a malformed date rather than building a window from it', () => {
    const held = [trade({ date: '' }), trade({ date: 'nope' })];
    expect(syncStartDate(held, 'schwab', TODAY)).toBeUndefined();
  });
});
