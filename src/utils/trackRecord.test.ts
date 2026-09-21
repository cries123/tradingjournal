import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import {
  buildTrackRecord,
  canPublish,
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
    expect(record.excludedTrades).toBe(2);
    expect(record.netPnl).toBe(0);
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
