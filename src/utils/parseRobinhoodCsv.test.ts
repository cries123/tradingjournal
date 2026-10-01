import { describe, expect, it } from 'vitest';
import { parseRobinhoodCsv } from './parseRobinhoodCsv';

/*
 * The Robinhood importer, which had no tests and did not work.
 *
 * Every number here can be checked against a statement by hand, because that is the only check that
 * would have caught any of this: stock trades silently dropped, a sale with no matching buy booked
 * at its full proceeds, scale-outs multiplied, and sides inverted.
 */

const HEADER =
  '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';

const csv = (rows: string[]): string => [HEADER, ...rows].join('\n');

/** A row in the shape Robinhood writes: debits in parentheses, credits bare. */
const row = (
  instrument: string,
  description: string,
  code: string,
  quantity: string,
  amount: string,
  date = '9/29/2026',
): string =>
  `"${date}","${date}","${date}","${instrument}","${description}","${code}","${quantity}","","${amount}"`;

const CALL = 'SPY 9/29/2026 Call $660.00';
const PUT = 'SPY 9/29/2026 Put $640.00';

describe('parseRobinhoodCsv stock trades', () => {
  it('imports a plain stock round trip at all', () => {
    /*
     * The bug that mattered most: the code list was tested with `includes` against an uppercased
     * string while holding 'Buy' and 'Sell' in mixed case, so neither could ever match. Robinhood
     * writes every equity trade as Buy or Sell, so all of them were dropped at the filter and the
     * importer said "no trades found" on a file full of them.
     */
    const trades = parseRobinhoodCsv(
      csv([
        row('AAPL', 'Apple Inc.', 'Buy', '10', '($2,200.00)'),
        row('AAPL', 'Apple Inc.', 'Sell', '10', '$2,260.00'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBe(60);
    expect(trades[0].symbol).toBe('AAPL');
    expect(trades[0].assetType).toBe('stock');
    expect(trades[0].side).toBe('long');
    expect(trades[0].quantity).toBe(10);
  });

  it('does not book the proceeds of a sale it has no buy for', () => {
    /*
     * The most expensive one. An unmatched close was imported at `pnl = row.amount`, the gross
     * proceeds — and a Robinhood export almost always begins mid-position. Selling $50,000 of stock
     * bought before the window showed up as a $50,000 profit, which would then flow into the
     * dashboard, the tax export and a published track record.
     */
    const trades = parseRobinhoodCsv(csv([row('AAPL', 'Apple Inc.', 'Sell', '250', '$50,000.00')]));

    expect(trades).toEqual([]);
  });
});

describe('parseRobinhoodCsv options', () => {
  it('keeps a credit trade short, and profitable', () => {
    // Sold at $3.00, bought back at $2.00. The side used to be read off the closing fill, where a
    // buy-to-close looks like a buy, so every short trade in the file was labelled long.
    const trades = parseRobinhoodCsv(
      csv([
        row('SPY', CALL, 'STO', '1', '$300.00'),
        row('SPY', CALL, 'BTC', '1', '($200.00)'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('short');
    expect(trades[0].pnl).toBe(100);
    expect(trades[0].assetType).toBe('option');
    expect(trades[0].optionType).toBe('call');
  });

  it('does not close one contract against a different one', () => {
    /*
     * The queue was keyed on the ticker, so every option on SPY shared it. Closing the call took
     * the put off the front of the queue and reported a round trip that never happened, on prices
     * belonging to two different positions.
     */
    const trades = parseRobinhoodCsv(
      csv([
        row('SPY', PUT, 'BTO', '1', '($400.00)'),
        row('SPY', CALL, 'BTO', '1', '($100.00)'),
        row('SPY', CALL, 'STC', '1', '$150.00'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBe(50);
    expect(trades[0].contract).toBe(CALL);
  });

  it('does not let a long and a short on one contract close each other', () => {
    const trades = parseRobinhoodCsv(
      csv([
        row('SPY', CALL, 'STO', '1', '$300.00'),
        row('SPY', CALL, 'BTO', '1', '($100.00)'),
        row('SPY', CALL, 'STC', '1', '$150.00'),
        row('SPY', CALL, 'BTC', '1', '($200.00)'),
      ]),
    );

    expect(trades).toHaveLength(2);
    expect(trades.every((t) => t.pnl > 0)).toBe(true);
    expect(trades.find((t) => t.side === 'long')?.pnl).toBe(50);
    expect(trades.find((t) => t.side === 'short')?.pnl).toBe(100);
  });
});

describe('parseRobinhoodCsv partial fills', () => {
  it('closes only the quantity that was closed', () => {
    /*
     * Quantity was parsed and then never used in the matching: a close took one whole lot whatever
     * its size. Selling one of five contracts booked the entire five-lot position, at five times
     * the real P&L, and left nothing for the rest of the scale-out to match against.
     */
    const trades = parseRobinhoodCsv(
      csv([
        row('SPY', CALL, 'BTO', '5', '($1,000.00)'),
        row('SPY', CALL, 'STC', '1', '$230.00'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe(1);
    expect(trades[0].pnl).toBe(30);
  });

  it('finishes a scale-out across the rest of the lot', () => {
    const trades = parseRobinhoodCsv(
      csv([
        row('SPY', CALL, 'BTO', '5', '($1,000.00)'),
        row('SPY', CALL, 'STC', '1', '$230.00'),
        row('SPY', CALL, 'STC', '4', '$880.00'),
      ]),
    );

    expect(trades.map((t) => t.quantity)).toEqual([1, 4]);
    // $1,110 back for $1,000 risked, whichever order it came out in.
    expect(trades.reduce((sum, t) => sum + t.pnl, 0)).toBeCloseTo(110, 10);
  });

  it('splits one close across two lots, FIFO', () => {
    const trades = parseRobinhoodCsv(
      csv([
        row('SPY', CALL, 'BTO', '2', '($200.00)'),
        row('SPY', CALL, 'BTO', '1', '($200.00)'),
        row('SPY', CALL, 'STC', '3', '$450.00'),
      ]),
    );

    expect(trades).toHaveLength(2);
    // First lot cost $100/contract and closed at $150: +$100 over two. Second cost $200: -$50.
    expect(trades.map((t) => t.pnl)).toEqual([100, -50]);
  });
});

describe('parseRobinhoodCsv parsing', () => {
  it('reads the activity date without moving it a day', () => {
    /*
     * The date used to go through `new Date(raw).toISOString()`, which reads the string as local
     * midnight and prints it in UTC — so for anyone east of UTC every trade landed on the previous
     * day. The test machine runs UTC, which is exactly how this repo lost a DST bug once before, so
     * this runs the parse under a non-UTC zone as well.
     */
    for (const tz of ['UTC', 'Australia/Sydney', 'America/Los_Angeles']) {
      const original = process.env.TZ;
      process.env.TZ = tz;
      try {
        const trades = parseRobinhoodCsv(
          csv([
            row('AAPL', 'Apple Inc.', 'Buy', '1', '($220.00)', '9/29/2026'),
            row('AAPL', 'Apple Inc.', 'Sell', '1', '$221.00', '9/29/2026'),
          ]),
        );
        expect(trades[0].date, `TZ=${tz}`).toBe('2026-09-29');
      } finally {
        process.env.TZ = original;
      }
    }
  });

  it('accepts an ISO activity date too', () => {
    const trades = parseRobinhoodCsv(
      csv([
        row('AAPL', 'Apple Inc.', 'Buy', '1', '($220.00)', '2026-09-29'),
        row('AAPL', 'Apple Inc.', 'Sell', '1', '$221.00', '2026-09-29'),
      ]),
    );

    expect(trades[0].date).toBe('2026-09-29');
  });

  it('skips a row whose date cannot be read rather than stamping it today', () => {
    // The old fallback was `new Date().toISOString()`, which moved a trade onto a day the trader
    // did not trade — and did it silently.
    const trades = parseRobinhoodCsv(
      csv([
        row('AAPL', 'Apple Inc.', 'Buy', '1', '($220.00)', 'sometime'),
        row('AAPL', 'Apple Inc.', 'Sell', '1', '$221.00', 'sometime'),
      ]),
    );

    expect(trades).toEqual([]);
  });

  it('ignores the non-trade rows a statement is full of', () => {
    const trades = parseRobinhoodCsv(
      csv([
        row('', 'ACH Deposit', 'ACH', '', '$5,000.00'),
        row('AAPL', 'Apple Inc. Dividend', 'CDIV', '', '$12.40'),
        row('AAPL', 'Apple Inc.', 'Buy', '1', '($220.00)'),
        row('AAPL', 'Apple Inc.', 'Sell', '1', '$221.00'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBe(1);
  });

  it('keeps a scratch, which is a real trade', () => {
    // The old filter dropped any trade worth exactly $0, which still counts in the trade count and
    // against the win rate.
    const trades = parseRobinhoodCsv(
      csv([
        row('AAPL', 'Apple Inc.', 'Buy', '1', '($220.00)'),
        row('AAPL', 'Apple Inc.', 'Sell', '1', '$220.00'),
      ]),
    );

    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBe(0);
  });

  it('refuses a file with no Amount column instead of reporting nothing', () => {
    // Every P&L here comes from that column. Without it every trade was worth $0 and the zero
    // filter then removed them all, so the importer said "no trades" and gave no reason.
    const noAmount = ['"Activity Date","Instrument","Description","Trans Code","Quantity"',
      '"9/29/2026","AAPL","Apple Inc.","Buy","1"'].join('\n');

    expect(() => parseRobinhoodCsv(noAmount)).toThrow(/Amount column/);
  });

  it('refuses a file that is not a Robinhood export', () => {
    expect(() => parseRobinhoodCsv('Date,Something\n2026-09-29,1')).toThrow(/Trans Code/);
    expect(() => parseRobinhoodCsv('')).toThrow(/empty/);
  });
});

describe('the opening date is kept', () => {
  it('records the open as well as the close', () => {
    const trades = parseRobinhoodCsv(
      csv([
        row('SPY', CALL, 'BTO', '1', '($100.00)', '9/28/2026'),
        row('SPY', CALL, 'STC', '1', '$150.00', '9/29/2026'),
      ]),
    );

    // The close is the journal date; the open is what a days-to-expiry panel needs.
    expect(trades[0].date).toBe('2026-09-29');
    expect(trades[0].openDate).toBe('2026-09-28');
  });
});
