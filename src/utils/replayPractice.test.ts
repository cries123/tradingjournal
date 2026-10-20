import { describe, expect, it } from 'vitest';
import { applyFill, EMPTY_BOOK, flatten, multiplierFor, unrealized } from './replayPractice';

/* Practice trades on a replay, booked the way a broker books them: averaged in, realized on the way out. */

const OPTION = multiplierFor('option');

describe('the practice book', () => {
  it('averages in, realizes on the way out, and flips through flat', () => {
    let book = applyFill(EMPTY_BOOK, 'buy', 2, 1, 100, OPTION);
    book = applyFill(book, 'buy', 2, 2, 160, OPTION);
    expect(book).toMatchObject({ qty: 4, avgPrice: 1.5, realized: 0 });

    book = applyFill(book, 'sell', 3, 2.5, 220, OPTION);
    expect(book).toMatchObject({ qty: 1, avgPrice: 1.5, realized: 300 });

    // Selling two against a long of one closes it and opens a short of one at the fill.
    book = applyFill(book, 'sell', 2, 3, 280, OPTION);
    expect(book).toMatchObject({ qty: -1, avgPrice: 3, realized: 450 });

    // A short gains when the price falls.
    expect(unrealized(book, 2, OPTION)).toBe(100);
    book = flatten(book, 2, 340, OPTION);
    expect(book).toMatchObject({ qty: 0, avgPrice: 0, realized: 550 });
    expect(book.fills.map((f) => f.realized)).toEqual([0, 0, 300, 150, 100]);
  });

  it('prices a share at one and a contract at a hundred', () => {
    const shares = applyFill(EMPTY_BOOK, 'buy', 10, 500, 1, multiplierFor('stock'));
    expect(unrealized(shares, 501, multiplierFor('stock'))).toBe(10);
    const contract = applyFill(EMPTY_BOOK, 'buy', 1, 1.2, 1, OPTION);
    expect(unrealized(contract, 1.35, OPTION)).toBe(15);
  });

  it('ignores a fill of nothing, a negative price, and a flatten of a flat book', () => {
    expect(applyFill(EMPTY_BOOK, 'buy', 0, 1, 1, OPTION)).toBe(EMPTY_BOOK);
    expect(applyFill(EMPTY_BOOK, 'buy', 1, -1, 1, OPTION)).toBe(EMPTY_BOOK);
    expect(flatten(EMPTY_BOOK, 1, 1, OPTION)).toBe(EMPTY_BOOK);
  });
});
