/**
 * Practice trades on a replay: the backtesting half of market replay.
 *
 * Fills happen at the close of the bar the replay is on, which is the one price a trader watching
 * the replay has actually seen. No slippage and no commission are invented: the point is to see
 * what the decision would have made, and an assumed cost is a number the app made up.
 *
 * One position per instrument, long or short, averaged in and out the way a broker reports it.
 */

export interface PracticeFill {
  time: number;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  /** Profit or loss this fill closed, in dollars. Zero for a fill that only opened or added. */
  realized: number;
}

export interface PracticeBook {
  /** Signed: positive long, negative short. */
  qty: number;
  /** Average price of the open position, or 0 when flat. */
  avgPrice: number;
  realized: number;
  fills: PracticeFill[];
}

export const EMPTY_BOOK: PracticeBook = { qty: 0, avgPrice: 0, realized: 0, fills: [] };

/** Dollars per point: 100 for an equity option contract, 1 for a share. */
export function multiplierFor(kind: 'option' | 'stock'): number {
  return kind === 'option' ? 100 : 1;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The book after one fill. Buying against a short covers it first, and anything left opens a
 * long; selling against a long the same way. Realized P&L is booked on the part that closes.
 */
export function applyFill(book: PracticeBook, side: 'buy' | 'sell', qty: number, price: number, time: number, multiplier: number): PracticeBook {
  if (!(qty > 0) || !Number.isFinite(price) || price < 0) return book;
  const signed = side === 'buy' ? qty : -qty;
  const closing = book.qty !== 0 && Math.sign(book.qty) !== Math.sign(signed) ? Math.min(Math.abs(book.qty), qty) : 0;
  const realized = closing > 0 ? cents((price - book.avgPrice) * closing * Math.sign(book.qty) * multiplier) : 0;

  const after = book.qty + signed;
  let avgPrice: number;
  if (after === 0) avgPrice = 0;
  else if (closing > 0 && Math.sign(after) !== Math.sign(book.qty)) avgPrice = price; // flipped through flat
  else if (closing > 0) avgPrice = book.avgPrice; // reduced, same side
  else avgPrice = (book.avgPrice * Math.abs(book.qty) + price * qty) / Math.abs(after); // opened or added

  return {
    qty: after,
    avgPrice,
    realized: cents(book.realized + realized),
    fills: [...book.fills, { time, side, qty, price, realized }],
  };
}

/** What the open position is worth against a mark, in dollars. */
export function unrealized(book: PracticeBook, mark: number, multiplier: number): number {
  return book.qty === 0 ? 0 : cents((mark - book.avgPrice) * book.qty * multiplier);
}

/** Closes whatever is open at the mark. A flat book is returned as it is. */
export function flatten(book: PracticeBook, mark: number, time: number, multiplier: number): PracticeBook {
  if (book.qty === 0) return book;
  return applyFill(book, book.qty > 0 ? 'sell' : 'buy', Math.abs(book.qty), mark, time, multiplier);
}
