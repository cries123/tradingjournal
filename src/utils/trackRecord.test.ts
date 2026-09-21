import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import {
  buildTrackRecord,
  canPublish,
  eligibleJournals,
  isBrokerVerified,
  maxDrawdownByDay,
  MIN_TRADES_TO_PUBLISH,
} from './trackRecord';

/*
 * The one page in this product that makes a claim to a stranger.
 *
 * Everything else reports a trader's numbers back to them, where being wrong is embarrassing. This
 * says "these came from a broker, not from him" to somebody deciding whether to believe it — so
 * the exclusion rule is the feature, and these tests exist to keep one typed trade from ever
 * reaching a figure on that page.
 */

let seq = 0;
const imported = (over: Partial<Trade> = {}): Trade =>
  ({
    id: `t${seq++}`,
    date: '2026-09-01',
    symbol: 'SPY',
    pnl: 100,
    sourceId: `snaptrade:o${seq}:c${seq}`,
    ...over,
  }) as Trade;

const typed = (over: Partial<Trade> = {}): Trade =>
  ({ id: `m${seq++}`, date: '2026-09-01', symbol: 'SPY', pnl: 100, ...over }) as Trade;

describe('isBrokerVerified', () => {
  it('accepts a trade the broker sent', () => {
    expect(isBrokerVerified(imported())).toBe(true);
  });

  it('rejects a hand-entered trade', () => {
    expect(isBrokerVerified(typed())).toBe(false);
  });

  it('rejects an empty sourceId rather than treating it as present', () => {
    // A blank string is what a half-written importer leaves behind, and it is not a broker.
    expect(isBrokerVerified(typed({ sourceId: '' } as Partial<Trade>))).toBe(false);
  });
});

describe('buildTrackRecord', () => {
  it('counts only imported trades, and reports how many it left out', () => {
    const record = buildTrackRecord([
      imported({ pnl: 100 }),
      imported({ pnl: -50 }),
      typed({ pnl: 10_000 }),
    ]);

    expect(record.verifiedTrades).toBe(2);
    expect(record.excludedTrades).toBe(1);
    // The typed 10,000 must not appear anywhere. This is the whole feature.
    expect(record.netPnl).toBe(50);
  });

  it('is empty, not broken, when nothing was imported', () => {
    const record = buildTrackRecord([typed(), typed()]);
    expect(record.verifiedTrades).toBe(0);
    expect(record.netPnl).toBe(0);

    /*
     * Zero excluded, not two.
     *
     * excludedTrades means "typed into an account this record covers". With nothing imported
     * anywhere there is no eligible journal, so the record covers no account and there is
     * nothing for a trade to be excluded FROM. The screen says what is actually wrong here —
     * that you need broker-imported trades and have none — from verifiedTrades.
     */
    expect(record.excludedTrades).toBe(0);
    expect(record.journalsEligible).toBe(0);
  });

  it('reports the span of the verified trades only', () => {
    const record = buildTrackRecord([
      typed({ date: '2020-01-01' }),
      imported({ date: '2026-03-03' }),
      imported({ date: '2026-09-19' }),
    ]);
    expect(record.firstDate).toBe('2026-03-03');
    expect(record.lastDate).toBe('2026-09-19');
  });

  it('averages wins and losses separately, keeping the loss negative', () => {
    const record = buildTrackRecord([
      imported({ pnl: 300 }),
      imported({ pnl: 100 }),
      imported({ pnl: -200 }),
    ]);
    expect(record.avgWin).toBe(200);
    expect(record.avgLoss).toBe(-200);
  });

  it('finds the best and worst day, not the best and worst trade', () => {
    const record = buildTrackRecord([
      imported({ date: '2026-09-01', pnl: 500 }),
      imported({ date: '2026-09-01', pnl: -400 }),
      imported({ date: '2026-09-02', pnl: -300 }),
    ]);
    // Day one nets +100 despite holding the single biggest winner.
    expect(record.bestDay).toBe(100);
    expect(record.worstDay).toBe(-300);
  });

  it('counts trading days, not calendar days', () => {
    const record = buildTrackRecord([
      imported({ date: '2026-09-01' }),
      imported({ date: '2026-09-01' }),
      imported({ date: '2026-09-30' }),
    ]);
    expect(record.tradingDays).toBe(2);
  });
});

describe('maxDrawdownByDay', () => {
  it('is zero for a record that only ever went up', () => {
    expect(maxDrawdownByDay([imported({ date: '2026-09-01', pnl: 100 }), imported({ date: '2026-09-02', pnl: 100 })])).toBe(0);
  });

  it('measures peak to trough, not start to trough', () => {
    // Up 500, down to 200: the drawdown is 300, not the 200 the account is still ahead by.
    const record = maxDrawdownByDay([
      imported({ date: '2026-09-01', pnl: 500 }),
      imported({ date: '2026-09-02', pnl: -300 }),
    ]);
    expect(record).toBe(-300);
  });

  it('keeps the deepest fall, not the latest', () => {
    const record = maxDrawdownByDay([
      imported({ date: '2026-09-01', pnl: 1000 }),
      imported({ date: '2026-09-02', pnl: -800 }),
      imported({ date: '2026-09-03', pnl: 900 }),
      imported({ date: '2026-09-04', pnl: -100 }),
    ]);
    expect(record).toBe(-800);
  });

  it('walks days in date order regardless of the order trades arrived', () => {
    const record = maxDrawdownByDay([
      imported({ date: '2026-09-03', pnl: -800 }),
      imported({ date: '2026-09-01', pnl: 1000 }),
    ]);
    expect(record).toBe(-800);
  });
});

describe('canPublish', () => {
  it('refuses a sample too small to call a record', () => {
    const few = Array.from({ length: MIN_TRADES_TO_PUBLISH - 1 }, () => imported());
    expect(canPublish(buildTrackRecord(few))).toBe(false);
  });

  it('allows it at the threshold', () => {
    const enough = Array.from({ length: MIN_TRADES_TO_PUBLISH }, () => imported());
    expect(canPublish(buildTrackRecord(enough))).toBe(true);
  });

  it('counts only verified trades toward the threshold', () => {
    // Padding a thin record with hand-entered trades must not unlock the page.
    const padded = [
      ...Array.from({ length: 5 }, () => imported()),
      ...Array.from({ length: 100 }, () => typed()),
    ];
    expect(canPublish(buildTrackRecord(padded))).toBe(false);
  });
});

/*
 * Journal scoping.
 *
 * Added after a real report: a trader cleared one journal, re-synced it, and the screen still said
 * 86 hand-entered trades were excluded — trades that were sitting untouched in a different journal
 * he had never intended to publish. The counting was right and the scope was wrong.
 */
describe('journal scoping', () => {
  const brokerJournal = () => imported({ accountId: 'broker' });
  const paperJournal = () => typed({ accountId: 'paper' });

  it('offers only journals that hold broker-imported trades', () => {
    const trades = [brokerJournal(), paperJournal(), paperJournal()];
    expect(eligibleJournals(trades)).toEqual(['broker']);
  });

  it('treats a trade with no accountId as the legacy journal', () => {
    // Trades predate journals; resolveTradeAccountId maps a missing id onto 'default'. Getting
    // this wrong would drop every trade an early user logged before journals existed.
    expect(eligibleJournals([imported()])).toEqual(['default']);
  });

  it('ignores hand-entered trades in journals the record does not cover', () => {
    // The reported bug, as a test. 'paper' is not eligible and not selected, so its 86 typed
    // trades are not in the record's excluded count.
    const trades = [
      ...Array.from({ length: 30 }, brokerJournal),
      ...Array.from({ length: 86 }, paperJournal),
    ];

    const record = buildTrackRecord(trades, eligibleJournals(trades));

    expect(record.verifiedTrades).toBe(30);
    expect(record.excludedTrades).toBe(0);
  });

  it('still counts hand-entered trades inside a journal it does cover', () => {
    // The other half. These were typed into the same account the record is about, so leaving them
    // uncounted would be hiding them rather than scoping them.
    const trades = [
      ...Array.from({ length: 30 }, brokerJournal),
      typed({ accountId: 'broker' }),
      typed({ accountId: 'broker' }),
    ];

    expect(buildTrackRecord(trades, ['broker']).excludedTrades).toBe(2);
  });

  it('covers every eligible journal when no selection is given', () => {
    const trades = [imported({ accountId: 'a' }), imported({ accountId: 'b' })];
    const record = buildTrackRecord(trades);

    expect(record.verifiedTrades).toBe(2);
    expect(record.journalsIncluded).toBe(2);
    expect(record.journalsEligible).toBe(2);
  });

  it('reports the ratio when a journal is left out, so the page can say so', () => {
    const trades = [
      ...Array.from({ length: 30 }, () => imported({ accountId: 'good', pnl: 500 })),
      ...Array.from({ length: 30 }, () => imported({ accountId: 'bad', pnl: -500 })),
    ];

    const record = buildTrackRecord(trades, ['good']);

    expect(record.journalsIncluded).toBe(1);
    expect(record.journalsEligible).toBe(2);
    // The cherry-picked figure is still computed — it is the disclosure that makes it honest,
    // not a refusal to compute it.
    expect(record.netPnl).toBe(15000);
  });

  it('does not count a paper journal towards the ratio', () => {
    // Otherwise excluding a hand-entry journal would make the page announce partial coverage,
    // punishing somebody who hid nothing.
    const trades = [
      ...Array.from({ length: 30 }, brokerJournal),
      ...Array.from({ length: 5 }, paperJournal),
    ];
    const record = buildTrackRecord(trades, eligibleJournals(trades));

    expect(record.journalsEligible).toBe(1);
    expect(record.journalsIncluded).toBe(1);
  });

  it('yields an empty record when every journal is deselected', () => {
    const trades = Array.from({ length: 30 }, brokerJournal);
    const record = buildTrackRecord(trades, []);

    expect(record.verifiedTrades).toBe(0);
    expect(canPublish(record)).toBe(false);
  });
});
