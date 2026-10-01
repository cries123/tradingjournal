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
    id: `snaptrade_schwab_${seq++}_0`,
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
    const other = [trade({ id: `snaptrade_robinhood_${seq++}_0` })];
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
      trade({ id: `snaptrade_robinhood_${seq++}_0`, date: '2026-09-29' }),
      trade({ id: `snaptrade_schwab_${seq++}_0`, date: '2026-07-01' }),
    ];

    expect(syncStartDate(held, 'schwab', TODAY)).toBe('2026-06-17');
  });

  it('does not match a journal id against a brokerage account id', () => {
    /*
     * The regression test for how this shipped broken.
     *
     * The first version compared trade.accountId to the id handed to a sync. But accountId is the
     * JOURNAL a trade was filed into — addTrades defaults it to settings.activeAccountId — while
     * the sync is given SnapTrade's account id. The two never matched, so this returned undefined
     * every time and every sync went on pulling the entire history. Ten tests passed, because they
     * used the same string on both sides of a comparison that is never the same string in life.
     *
     * The brokerage account survives onto the trade only in its document id.
     */
    const filedInAJournal = [
      { id: 'abc', accountId: 'schwab-journal', date: '2026-09-20', symbol: 'SPY', pnl: 1, sourceId: 'snaptrade:a:b' },
    ] as unknown as Trade[];

    expect(syncStartDate(filedInAJournal, 'schwab-journal', TODAY)).toBeUndefined();
  });

  it('ignores a trade imported before the id scheme rather than guessing', () => {
    // Falls back to a full pull, which is the safe direction: a window built on a trade we cannot
    // attribute to this connection could skip real fills.
    const held = [trade({ id: 'legacy-1', date: '2026-09-20' })];
    expect(syncStartDate(held, 'schwab', TODAY)).toBeUndefined();
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
