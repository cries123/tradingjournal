import { describe, expect, it } from 'vitest';
import { parseSchwabCsv } from './parseSchwabCsv';

/*
 * The CSV importer, which had no tests at all until the two bugs below were found by reading it.
 *
 * It is the only way in for anyone whose broker SnapTrade does not cover, and parseTosCsv hands
 * thinkorswim exports straight to it, so a number wrong here is wrong on the dashboard, in the tax
 * export and on a published track record. Every expectation in this file is a dollar figure that
 * can be checked against a statement by hand, because that is the only check that would have
 * caught either bug.
 */

const HEADER =
  ',Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type';

/** A thinkorswim "Account Trade History" export wrapped around the rows under test. */
const csv = (rows: string[]): string =>
  ['Account Trade History', '', HEADER, ...rows, '', 'Equities', ''].join('\n');

const stock = (time: string, side: string, qty: string, effect: string, price: string): string =>
  `,9/29/26 ${time},STOCK,${side},${qty},${effect},AAPL,,,,${price},${price},LMT`;

const call = (time: string, side: string, qty: string, effect: string, price: string): string =>
  `,9/29/26 ${time},SINGLE,${side},${qty},${effect},SPY,29 SEP 26,660,CALL,${price},${price},LMT`;

const CONTRACT_FEE = 0.65;

describe('parseSchwabCsv commissions', () => {
  it('charges nothing to trade shares', () => {
    /*
     * The fee was applied to the quantity field without asking what the quantity counted, so a
     * 500-share round trip was billed 500 contracts of commission on each leg. Schwab charges $0
     * on equities, and this $500 winner was imported as a $150 loser — then counted as a loss by
     * every win rate, profit factor, streak and tax total downstream.
     */
    const trades = parseSchwabCsv(
      csv([
        stock('09:31:05', 'BUY', '+500', 'TO OPEN', '220.00'),
        stock('15:52:10', 'SELL', '-500', 'TO CLOSE', '221.00'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBe(500);
    expect(trades[0].assetType).toBe('stock');
    expect(trades[0].quantity).toBe(500);
    expect(trades[0].side).toBe('long');
  });

  it('charges options per contract on both legs', () => {
    // The case that was always right, and the reason the fee cannot simply be dropped: ten
    // contracts in and ten out is $13 of real commission, which is most of a scalp.
    const trades = parseSchwabCsv(
      csv([
        call('09:31:05', 'BUY', '+10', 'TO OPEN', '2.00'),
        call('09:44:00', 'SELL', '-10', 'TO CLOSE', '2.30'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBe(287);
    expect(trades[0].assetType).toBe('option');
    expect(trades[0].optionType).toBe('call');
  });

  it('splits one closing commission across the lots it closes', () => {
    // Three contracts closed against two lots must bill three contracts of closing commission in
    // total, not three against each lot.
    const trades = parseSchwabCsv(
      csv([
        call('09:31:05', 'BUY', '+2', 'TO OPEN', '1.00'),
        call('09:32:00', 'BUY', '+1', 'TO OPEN', '2.00'),
        call('10:15:00', 'SELL', '-3', 'TO CLOSE', '3.00'),
      ]),
    );

    expect(trades.map((t) => t.pnl)).toEqual([397.4, 98.7]);

    const gross = 400 + 100;
    const booked = trades.reduce((sum, t) => sum + t.pnl, 0);
    // Six contracts changed hands: two in, one in, three out.
    expect(gross - booked).toBeCloseTo(6 * CONTRACT_FEE, 10);
  });
});

describe('parseSchwabCsv direction', () => {
  it('keeps a credit trade a winner when it is bought back cheaper', () => {
    // Selling to open is how most of the traders here trade 0DTE. Short P&L runs the other way:
    // the position gains when the price falls.
    const trades = parseSchwabCsv(
      csv([
        call('09:31:05', 'SELL', '-2', 'TO OPEN', '1.50'),
        call('11:02:00', 'BUY', '+2', 'TO CLOSE', '0.50'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('short');
    expect(trades[0].pnl).toBe(197.4);
  });

  it('does not let a long and a short on the same contract close each other', () => {
    /*
     * The inversion. Long and short lots of one contract shared a single FIFO queue, so each close
     * took whichever lot was at the front regardless of direction and read its own side off the
     * closing fill. Both of these trades won; both were imported as losses.
     *
     * Booked correctly: the short gains $100 (sold at 3.00, bought back at 2.00) and the long
     * gains $50 (bought at 1.00, sold at 1.50), $147.40 after four contracts of commission.
     * Booked the old way they were -$151.30 and -$101.30, a $400 error on one day, which is how
     * server/mapSnapTradeActivities.ts came to carry the same fix.
     */
    const trades = parseSchwabCsv(
      csv([
        call('09:31:05', 'SELL', '-1', 'TO OPEN', '3.00'),
        call('09:35:00', 'BUY', '+1', 'TO OPEN', '1.00'),
        call('10:00:00', 'SELL', '-1', 'TO CLOSE', '1.50'),
        call('10:30:00', 'BUY', '+1', 'TO CLOSE', '2.00'),
      ]),
    );

    expect(trades).toHaveLength(2);
    expect(trades.every((t) => t.pnl > 0)).toBe(true);
    expect(trades.reduce((sum, t) => sum + t.pnl, 0)).toBeCloseTo(147.4, 10);

    const long = trades.find((t) => t.side === 'long');
    const short = trades.find((t) => t.side === 'short');
    // Each close found the lot it actually unwound, which is what the prices prove.
    expect(long?.tradePrice).toBe(1);
    expect(long?.exitPrice).toBe(1.5);
    expect(short?.tradePrice).toBe(3);
    expect(short?.exitPrice).toBe(2);
  });

  it('leaves a close with no matching lot out rather than inventing one', () => {
    /*
     * A statement that starts mid-position has a close with nothing to match. Under the old key it
     * found the long lot sitting in the shared queue and booked a fabricated $101 loss against a
     * position the trader never closed.
     */
    const trades = parseSchwabCsv(
      csv([
        call('09:31:05', 'BUY', '+1', 'TO OPEN', '1.00'),
        call('10:00:00', 'BUY', '+1', 'TO CLOSE', '2.00'),
      ]),
    );

    expect(trades).toEqual([]);
  });
});

describe('parseSchwabCsv parsing', () => {
  it('carries the fill time, date and contract through', () => {
    const trades = parseSchwabCsv(
      csv([
        call('09:31:05', 'BUY', '+1', 'TO OPEN', '2.00'),
        call('13:05:00', 'SELL', '-1', 'TO CLOSE', '2.50'),
      ]),
    );

    expect(trades[0].date).toBe('2026-09-29');
    expect(trades[0].entryTime).toBe('09:31');
    expect(trades[0].exitTime).toBe('13:05');
    expect(trades[0].expiration).toBe('2026-09-29');
    expect(trades[0].strike).toBe(660);
    expect(trades[0].contract).toBe('SPY 29 SEP 26 660 C');
  });

  it('refuses a file that is not a trade history', () => {
    expect(() => parseSchwabCsv('Date,Amount')).toThrow(/Account Trade History/);
  });
});

describe('the commission is recorded, not just subtracted', () => {
  /*
   * The importer worked out a per-contract fee, took it off the P&L, and then wrote neither the gross
   * nor the fee onto the trade. So an estimate the app had already applied to somebody's numbers was
   * invisible and uncorrectable, the costs panel reported commissions over a denominator that
   * included these fee-less trades, and the tax export printed $0.00 of fees beside a P&L that had
   * fees inside it.
   */
  const roundTrip = () =>
    parseSchwabCsv(
      csv([
        call('09:31:05', 'BUY', '+10', 'TO OPEN', '2.00'),
        call('09:44:00', 'SELL', '-10', 'TO CLOSE', '2.30'),
      ]),
    )[0]!;

  it('writes the fee it charged', () => {
    // Ten contracts in and ten out, at $0.65 each.
    expect(roundTrip().fees).toBe(13);
  });

  it('writes the gross it computed', () => {
    expect(roundTrip().grossPnl).toBe(300);
  });

  it('still nets to the same P&L it always did', () => {
    const trade = roundTrip();
    expect(trade.pnl).toBe(287);
    // The invariant that makes this safe: effectivePnl recomputes gross - fees, and must agree with
    // the stored net rather than charging the fee a second time.
    expect(trade.grossPnl! - trade.fees!).toBeCloseTo(trade.pnl, 10);
  });

  it('records no fee on an equity round trip, because there is none', () => {
    const stockTrade = parseSchwabCsv(
      csv([
        stock('09:31:05', 'BUY', '+500', 'TO OPEN', '220.00'),
        stock('15:52:10', 'SELL', '-500', 'TO CLOSE', '221.00'),
      ]),
    )[0]!;

    expect(stockTrade.fees).toBe(0);
    expect(stockTrade.grossPnl).toBe(500);
    expect(stockTrade.pnl).toBe(500);
  });

  it('splits the fee across the lots a close covers, to the cent', () => {
    // Six contracts changed hands, so $3.90 of commission exists in total and must be apportioned
    // rather than counted per row.
    const trades = parseSchwabCsv(
      csv([
        call('09:31:05', 'BUY', '+2', 'TO OPEN', '1.00'),
        call('09:32:00', 'BUY', '+1', 'TO OPEN', '2.00'),
        call('10:15:00', 'SELL', '-3', 'TO CLOSE', '3.00'),
      ]),
    );

    const totalFees = trades.reduce((sum, t) => sum + (t.fees ?? 0), 0);
    expect(totalFees).toBeCloseTo(6 * 0.65, 10);
    for (const t of trades) {
      expect(t.grossPnl! - t.fees!).toBeCloseTo(t.pnl, 10);
    }
  });
});
