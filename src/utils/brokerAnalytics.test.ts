import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import {
  breakevenStats,
  costStats,
  dailyLoadRows,
  daysToExpiry,
  expiryRows,
  instrumentRows,
  orderTrades,
  sequenceRows,
  sizingStats,
  tiltStats,
  tradeNotional,
  tradingDays,
} from './brokerAnalytics';

let counter = 0;
const trade = (over: Partial<Trade> = {}): Trade =>
  ({ id: `t${counter++}`, date: '2026-08-03', symbol: 'SPY', pnl: 0, ...over }) as Trade;

/** n trades on one day with the given P&Ls, in the order given. */
const day = (date: string, pnls: number[], over: Partial<Trade> = {}): Trade[] =>
  pnls.map((pnl) => trade({ date, pnl, ...over }));

describe('orderTrades', () => {
  it('sorts by date, then entry time, then the order it was handed', () => {
    const a = trade({ date: '2026-08-04', entryTime: '09:31' });
    const b = trade({ date: '2026-08-03', entryTime: '14:05' });
    const c = trade({ date: '2026-08-03', entryTime: '09:45' });

    expect(orderTrades([a, b, c])).toEqual([c, b, a]);
  });

  it('keeps the given order within a day when no trade carries a clock time', () => {
    // This is the Schwab case: SnapTrade sends a bare date, so the importer's order is the only
    // sequence there is. Every panel that talks about "the next trade" rests on this.
    const first = trade({ pnl: 10 });
    const second = trade({ pnl: -20 });
    const third = trade({ pnl: 30 });

    expect(orderTrades([first, second, third])).toEqual([first, second, third]);
  });

  it('does not reorder a day when only some trades are timed', () => {
    // A half-timed day must not shuffle the untimed trades around the timed ones, or the sequence
    // panels would report a rhythm that never happened.
    const untimedFirst = trade({ pnl: 1 });
    const timed = trade({ pnl: 2, entryTime: '09:30' });
    const untimedLast = trade({ pnl: 3 });

    expect(orderTrades([untimedFirst, timed, untimedLast])).toEqual([untimedFirst, timed, untimedLast]);
  });

  it('leaves the input array alone', () => {
    const input = [trade({ date: '2026-08-05' }), trade({ date: '2026-08-01' })];
    const before = [...input];
    orderTrades(input);
    expect(input).toEqual(before);
  });
});

describe('tradingDays', () => {
  it('groups by calendar day in date order', () => {
    const grouped = tradingDays([
      ...day('2026-08-05', [1, 2]),
      ...day('2026-08-03', [3]),
    ]);
    expect(grouped.map((d) => d.length)).toEqual([1, 2]);
    expect(grouped[0][0].date).toBe('2026-08-03');
  });
});

describe('breakevenStats', () => {
  it('computes the win rate the payoff ratio demands', () => {
    // Wins of 100, losses of 100: a coin flip needs exactly half.
    const stats = breakevenStats([
      trade({ pnl: 100 }),
      trade({ pnl: 100 }),
      trade({ pnl: -100 }),
      trade({ pnl: -100 }),
      trade({ pnl: -100 }),
    ]);

    expect(stats).not.toBeNull();
    expect(stats!.requiredWinRate).toBeCloseTo(50, 6);
    expect(stats!.winRate).toBeCloseTo(40, 6);
    expect(stats!.payoff).toBeCloseTo(1, 6);
    expect(stats!.gap).toBeCloseTo(-10, 6);
  });

  it('asks for a lower win rate as the payoff improves', () => {
    // Wins of 200 against losses of 100 need a third, not a half.
    const stats = breakevenStats([
      trade({ pnl: 200 }),
      trade({ pnl: 200 }),
      trade({ pnl: -100 }),
      trade({ pnl: -100 }),
      trade({ pnl: -100 }),
    ]);

    expect(stats!.payoff).toBeCloseTo(2, 6);
    expect(stats!.requiredWinRate).toBeCloseTo((100 / 300) * 100, 6);
  });

  it('reads P&L net of fees', () => {
    // A $60 gross win that paid $70 in commissions is a losing trade, and the breakeven maths has
    // to see it that way or the panel disagrees with the calendar.
    const stats = breakevenStats([
      trade({ grossPnl: 60, fees: 70, pnl: -10 }),
      trade({ pnl: 100 }),
      trade({ pnl: 100 }),
      trade({ pnl: -100 }),
      trade({ pnl: -100 }),
    ]);

    expect(stats!.winRate).toBeCloseTo(40, 6);
  });

  it('says nothing without both a winner and a loser', () => {
    expect(breakevenStats(Array.from({ length: 8 }, () => trade({ pnl: 50 })))).toBeNull();
    expect(breakevenStats(Array.from({ length: 8 }, () => trade({ pnl: -50 })))).toBeNull();
  });

  it('says nothing on a sample too thin to mean anything', () => {
    expect(breakevenStats([trade({ pnl: 10 }), trade({ pnl: -10 })])).toBeNull();
  });
});

describe('tradeNotional', () => {
  it('multiplies an option by a hundred and a share by one', () => {
    expect(tradeNotional(trade({ assetType: 'option', quantity: 2, tradePrice: 1.5 }))).toBe(300);
    expect(tradeNotional(trade({ assetType: 'stock', quantity: 10, tradePrice: 20 }))).toBe(200);
  });

  it('prefers an explicit contract size', () => {
    expect(
      tradeNotional(trade({ assetType: 'option', quantity: 1, tradePrice: 2, contractSize: 50 })),
    ).toBe(100);
  });

  it('ignores the sign of a short quantity', () => {
    expect(tradeNotional(trade({ assetType: 'stock', quantity: -10, tradePrice: 20 }))).toBe(200);
  });

  it('returns null when the size cannot be known', () => {
    expect(tradeNotional(trade({ quantity: 10 }))).toBeNull();
    expect(tradeNotional(trade({ tradePrice: 10 }))).toBeNull();
    expect(tradeNotional(trade({ quantity: 10, tradePrice: 0 }))).toBeNull();
  });
});

describe('sizingStats', () => {
  const sized = (pnl: number, price: number) =>
    trade({ pnl, quantity: 1, tradePrice: price, assetType: 'stock' });

  it('reports bigger bets on the losers as a ratio above one', () => {
    const stats = sizingStats([
      sized(50, 100),
      sized(50, 100),
      sized(50, 100),
      sized(-50, 300),
      sized(-50, 300),
      sized(-50, 300),
    ]);

    expect(stats!.avgWinnerSize).toBeCloseTo(100, 6);
    expect(stats!.avgLoserSize).toBeCloseTo(300, 6);
    expect(stats!.ratio).toBeCloseTo(3, 6);
  });

  it('splits the biggest quarter of positions from the rest', () => {
    // Eight trades, so the top quarter is the two largest — both losers here.
    const stats = sizingStats([
      sized(10, 10),
      sized(10, 10),
      sized(10, 10),
      sized(10, 10),
      sized(10, 10),
      sized(-500, 900),
      sized(-500, 1000),
      sized(-10, 20),
    ]);

    expect(stats!.biggestQuarterTrades).toBe(2);
    expect(stats!.biggestQuarterNet).toBeCloseTo(-1000, 6);
    expect(stats!.restTrades).toBe(6);
    expect(stats!.restNet).toBeCloseTo(40, 6);
  });

  it('reports the split per trade as well as in total', () => {
    // Both halves losing is the case the totals mislead on: eight small losses add up to more than
    // two large ones, so the totals accuse the small trades while the per-trade figures show each
    // large position costing ten times as much.
    const stats = sizingStats([
      sized(-100, 900),
      sized(-100, 1000),
      ...Array.from({ length: 4 }, () => sized(-25, 10)),
      sized(10, 11),
      sized(10, 12),
      sized(10, 13),
    ]);

    // Nine trades, so the biggest quarter is the two large positions.
    expect(stats!.biggestQuarterTrades).toBe(2);
    expect(stats!.biggestQuarterNet).toBeCloseTo(-200, 6);
    expect(stats!.restNet).toBeCloseTo(-70, 6);
    // The totals make the two large trades look like three quarters of the damage; per trade, each
    // one costs ten times what a small one does.
    expect(stats!.biggestQuarterPerTrade).toBeCloseTo(-100, 6);
    expect(stats!.restPerTrade).toBeCloseTo(-10, 6);
    expect(stats!.biggestQuarterPerTrade).toBeLessThan(stats!.restPerTrade);
  });

  it('ignores trades with no size on them', () => {
    const stats = sizingStats([
      sized(50, 100),
      sized(50, 100),
      sized(50, 100),
      sized(-50, 100),
      sized(-50, 100),
      sized(-50, 100),
      trade({ pnl: 9999 }),
    ]);

    expect(stats!.covered).toBe(6);
  });

  it('says nothing without a sample on each side', () => {
    const stats = sizingStats([
      sized(50, 100),
      sized(50, 100),
      sized(50, 100),
      sized(50, 100),
      sized(50, 100),
      sized(-50, 100),
    ]);
    expect(stats).toBeNull();
  });
});

describe('tiltStats', () => {
  it('averages the trade after a loss against the trade after a win', () => {
    const stats = tiltStats([
      ...day('2026-08-03', [-100, -60, -30, 20, -40]),
      ...day('2026-08-04', [50, 10, 40, 30]),
    ]);

    // After a loss: -60, -30, 20. After a win: -40 (day one), then 10, 40, 30.
    expect(stats!.afterLossCount).toBe(3);
    expect(stats!.afterWinCount).toBe(4);
    expect(stats!.afterLossAvg).toBeCloseTo(-70 / 3, 6);
    expect(stats!.afterWinAvg).toBeCloseTo(10, 6);
    expect(stats!.delta).toBeCloseTo(-70 / 3 - 10, 6);
  });

  it('never pairs across a day boundary', () => {
    // Yesterday's last loss has nothing to do with today's first trade, and pairing them would
    // turn a bad week into a claim about revenge trading. Here the only loss is the last trade of
    // day one, so there is no "after a loss" sample at all and the honest answer is nothing.
    const stats = tiltStats([
      ...day('2026-08-03', [10, 20, 30, -100]),
      ...day('2026-08-04', [10, 20, 30, 40]),
    ]);

    expect(stats).toBeNull();
  });

  it('pairs within a day but not between two', () => {
    // Same trades, arranged so each day carries its own loss. Across-day pairing would find six
    // after-a-loss trades here instead of three.
    const stats = tiltStats([
      ...day('2026-08-03', [-10, 5, -10, 5]),
      ...day('2026-08-04', [-10, 5, 20, 30]),
    ]);

    expect(stats!.afterLossCount).toBe(3);
    expect(stats!.afterWinCount).toBe(3);
  });

  it('says nothing without enough of both kinds', () => {
    expect(tiltStats(day('2026-08-03', [10, 20, 30, 40]))).toBeNull();
  });
});

describe('sequenceRows', () => {
  it('buckets trades by their position in the day and pools the tail', () => {
    const rows = sequenceRows([
      ...day('2026-08-03', [10, -5, 3, 1, 1]),
      ...day('2026-08-04', [20, -5, 3, 1, 1]),
      ...day('2026-08-05', [30, -5, 3, 1, 1]),
    ]);

    const first = rows.find((r) => r.label === '1st');
    const fourthPlus = rows.find((r) => r.label === '4th+');

    expect(first!.trades).toBe(3);
    expect(first!.pnl).toBeCloseTo(60, 6);
    // Positions four and five of three days = six trades at $1 each.
    expect(fourthPlus!.trades).toBe(6);
    expect(fourthPlus!.pnl).toBeCloseTo(6, 6);
  });

  it('drops a position too rare to say anything about', () => {
    const rows = sequenceRows([
      ...day('2026-08-03', [10, 10, 10]),
      ...day('2026-08-04', [10, 10, 10]),
      ...day('2026-08-05', [10, 10, 10, 10]),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['1st', '2nd', '3rd']);
  });
});

describe('dailyLoadRows', () => {
  it('groups whole days by how much was traded in them', () => {
    const trades = [
      ...day('2026-08-03', [100]),
      ...day('2026-08-04', [100]),
      ...day('2026-08-05', [100]),
      ...day('2026-08-06', [-40, -40, -40, -40, -40, -40, -40]),
      ...day('2026-08-07', [-40, -40, -40, -40, -40, -40, -40]),
      ...day('2026-08-10', [-40, -40, -40, -40, -40, -40, -40]),
    ];
    const rows = dailyLoadRows(trades);

    const quiet = rows.find((r) => r.label === '1–2 trades');
    const busy = rows.find((r) => r.label === '6–10 trades');

    expect(quiet!.days).toBe(3);
    expect(quiet!.perDay).toBeCloseTo(100, 6);
    expect(quiet!.greenDays).toBe(3);
    expect(busy!.days).toBe(3);
    expect(busy!.perDay).toBeCloseTo(-280, 6);
    expect(busy!.greenDays).toBe(0);
  });

  it('says nothing off a handful of days', () => {
    expect(dailyLoadRows([...day('2026-08-03', [1]), ...day('2026-08-04', [1])])).toEqual([]);
  });
});

describe('daysToExpiry', () => {
  it('counts whole days from the fill to the expiry', () => {
    expect(daysToExpiry(trade({ date: '2026-08-03', expiration: '2026-08-03' }))).toBe(0);
    expect(daysToExpiry(trade({ date: '2026-08-03', expiration: '2026-08-10' }))).toBe(7);
  });

  it('survives an expiry sent as a full timestamp', () => {
    expect(daysToExpiry(trade({ date: '2026-08-03', expiration: '2026-08-21T00:00:00Z' }))).toBe(18);
  });

  it('reads both dates in the same zone, whatever the browser is set to', () => {
    // A date-only string parses as UTC and a date-with-clock parses as local, so mixing the two
    // forms puts hours between the endpoints and rounds the answer off by a day for anybody west
    // of Greenwich. Both are read as UTC here, which is what makes this hold in every zone.
    const original = process.env.TZ;
    try {
      for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
        process.env.TZ = zone;
        expect(daysToExpiry(trade({ date: '2026-08-03', expiration: '2026-08-21' }))).toBe(18);
        // Across the US daylight-saving change, where the two endpoints are an hour apart locally.
        expect(daysToExpiry(trade({ date: '2026-10-25', expiration: '2026-11-15' }))).toBe(21);
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('rejects an expiry before the trade', () => {
    expect(daysToExpiry(trade({ date: '2026-08-10', expiration: '2026-08-03' }))).toBeNull();
  });

  it('returns null with no expiry at all', () => {
    expect(daysToExpiry(trade({ date: '2026-08-03' }))).toBeNull();
  });
});

describe('expiryRows', () => {
  it('splits same-day expiries from everything else', () => {
    const zeroDte = Array.from({ length: 3 }, () =>
      trade({ date: '2026-08-03', expiration: '2026-08-03', pnl: -100 }),
    );
    const weeklies = Array.from({ length: 3 }, () =>
      trade({ date: '2026-08-03', expiration: '2026-08-07', pnl: 80 }),
    );

    const rows = expiryRows([...zeroDte, ...weeklies]);
    expect(rows.map((r) => r.label)).toEqual(['0DTE', '1–7 days']);
    expect(rows[0].pnl).toBeCloseTo(-300, 6);
    expect(rows[1].pnl).toBeCloseTo(240, 6);
  });

  it('ignores trades with no expiry', () => {
    const rows = expiryRows([
      ...Array.from({ length: 6 }, () => trade({ expiration: '2026-08-03', pnl: 10 })),
      ...Array.from({ length: 6 }, () => trade({ pnl: -999 })),
    ]);
    expect(rows.reduce((sum, r) => sum + r.trades, 0)).toBe(6);
  });
});

describe('instrumentRows', () => {
  it('keeps calls, puts and shares apart', () => {
    const rows = instrumentRows([
      ...Array.from({ length: 3 }, () =>
        trade({ assetType: 'option', optionType: 'call', pnl: 100 }),
      ),
      ...Array.from({ length: 3 }, () => trade({ assetType: 'option', optionType: 'put', pnl: -50 })),
      ...Array.from({ length: 3 }, () => trade({ assetType: 'stock', pnl: 10 })),
    ]);

    expect(rows.map((r) => r.label)).toEqual(['Calls', 'Puts', 'Shares']);
    expect(rows[0].pnl).toBeCloseTo(300, 6);
    expect(rows[1].pnl).toBeCloseTo(-150, 6);
  });

  it('drops a row too small to read', () => {
    const rows = instrumentRows([
      ...Array.from({ length: 3 }, () => trade({ assetType: 'stock', pnl: 10 })),
      trade({ assetType: 'option', optionType: 'call', pnl: 1000 }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Shares']);
  });
});

describe('costStats', () => {
  it('reports fees against the gross profit they came out of', () => {
    const stats = costStats(
      Array.from({ length: 6 }, () => trade({ grossPnl: 100, fees: 20, pnl: 80 })),
    );

    expect(stats!.fees).toBeCloseTo(120, 6);
    expect(stats!.perTrade).toBeCloseTo(20, 6);
    expect(stats!.grossProfit).toBeCloseTo(600, 6);
    expect(stats!.shareOfGross).toBeCloseTo(20, 6);
    expect(stats!.net).toBeCloseTo(480, 6);
  });

  it('counts only the winning trades towards gross profit', () => {
    // Netting the losers off first would understate the share and flatter the fee load.
    const stats = costStats([
      ...Array.from({ length: 3 }, () => trade({ grossPnl: 100, fees: 10, pnl: 90 })),
      ...Array.from({ length: 3 }, () => trade({ grossPnl: -100, fees: 10, pnl: -110 })),
    ]);

    expect(stats!.grossProfit).toBeCloseTo(300, 6);
    expect(stats!.shareOfGross).toBeCloseTo(20, 6);
  });

  it('says nothing when the broker sends no fees', () => {
    expect(costStats(Array.from({ length: 10 }, () => trade({ pnl: 10 })))).toBeNull();
  });
});

describe('ordering is not an artefact of how the journal arrived', () => {
  /*
   * orderTrades fell back to "the order the caller had them in", and the main caller does not
   * preserve the import order: a Firestore snapshot arrives in lexicographic document-id order and is
   * then sorted by DATE alone — a stable sort, so within a day the snapshot's own order survives.
   *
   * Every panel built on this reads a sequence. tiltStats pairs each trade with the one before it, so
   * reordering a day does not merely shuffle the output — it changes which trades follow a loss, and
   * with MIN_PER_GROUP gates it can take a real answer to null. The id carries the importer's index,
   * so it is now the tie-break ahead of the caller's.
   */
  const imported = (index: number, pnl: number, date = '2026-08-03'): Trade =>
    ({
      id: `snaptrade_acct_1700000000000_${String(index).padStart(4, '0')}`,
      date,
      symbol: 'SPY',
      pnl,
    }) as Trade;

  /** Alternating win/loss so both tilt groups clear MIN_PER_GROUP. */
  const day = [
    imported(0, 100), imported(1, -50), imported(2, 100), imported(3, -50),
    imported(4, 100), imported(5, -50), imported(6, 100), imported(7, -50),
  ];

  it('puts an import back into its sequence whatever order it is handed in', () => {
    const shuffled = [day[5]!, day[2]!, day[7]!, day[0]!, day[3]!, day[6]!, day[1]!, day[4]!];
    expect(orderTrades(shuffled).map((t) => t.id)).toEqual(day.map((t) => t.id));
  });

  it('gives the same tilt answer from the same trades in any order', () => {
    const shuffled = [...day].reverse();

    const straight = tiltStats(day);
    const jumbled = tiltStats(shuffled);

    expect(straight).not.toBeNull();
    expect(jumbled).toEqual(straight);
  });

  it('still prefers a real fill time over the id', () => {
    // The id is the FALLBACK. A journal that has times must be ordered by them, or a hand-entered
    // afternoon trade sorts by whenever its row happened to be written.
    const morning = { ...imported(9, 100), entryTime: '09:31' } as Trade;
    const afternoon = { ...imported(1, -50), entryTime: '14:05' } as Trade;

    expect(orderTrades([afternoon, morning]).map((t) => t.entryTime)).toEqual(['09:31', '14:05']);
  });
});

describe('what the commission percentage is a percentage of', () => {
  /*
   * The fees were summed over the trades that CARRY a fee and the gross over every trade in the
   * journal, so the percentage described two different populations. Any journal mixing synced trades
   * with hand-entered ones — or with CSV imports, which recorded no fee at all until today — diluted
   * it, and the sentence on screen reads "Commissions took 4% of your gross profit … not what is
   * deciding your year". It was small because the denominator had grown.
   */
  const withFee = (pnl: number, fees: number): Trade =>
    trade({ pnl: pnl - fees, grossPnl: pnl, fees });

  it('is the same answer whether or not fee-less trades sit beside it', () => {
    const synced = [withFee(20, 4), withFee(20, 4), withFee(20, 4), withFee(20, 4), withFee(20, 4)];
    const alone = costStats(synced);
    const diluted = costStats([
      ...synced,
      trade({ pnl: 20 }),
      trade({ pnl: 20 }),
      trade({ pnl: 20 }),
      trade({ pnl: 20 }),
      trade({ pnl: 20 }),
    ]);

    expect(alone).not.toBeNull();
    expect(diluted!.shareOfGross).toBeCloseTo(alone!.shareOfGross, 10);
  });

  it('reports the share of the gross the fees were actually taken from', () => {
    // $20 of fees against $100 of gross on the trades that paid them: 20%, not 4%.
    const stats = costStats([withFee(20, 4), withFee(20, 4), withFee(20, 4), withFee(20, 4), withFee(20, 4)]);
    expect(stats!.fees).toBeCloseTo(20, 10);
    expect(stats!.grossProfit).toBeCloseTo(100, 10);
    expect(stats!.shareOfGross).toBeCloseTo(20, 10);
  });

  it('counts only the trades it says it counts', () => {
    // `covered` is rendered as "across N trades", so it has to describe the same set as the figure.
    const stats = costStats([
      withFee(20, 4), withFee(20, 4), withFee(20, 4), withFee(20, 4), withFee(20, 4),
      trade({ pnl: 500 }),
    ]);
    expect(stats!.covered).toBe(5);
  });
});

describe('days to expiry is measured from the open', () => {
  /*
   * It read `trade.date`, which is the CLOSING fill on every imported trade — all three importers set
   * it from the close. So a Friday-expiry option bought on Monday and sold on Friday reported zero
   * days to expiry and landed in the 0DTE row, under a panel headed "time left when you opened".
   * Every multi-day hold was bucketed by its remaining life at exit.
   */
  it('uses the opening date when the importer recorded one', () => {
    const heldAllWeek = trade({
      openDate: '2026-03-02',
      date: '2026-03-06',
      expiration: '2026-03-06',
      assetType: 'option',
    });

    expect(daysToExpiry(heldAllWeek)).toBe(4);
  });

  it('does not report a week-long hold as a 0DTE trade', () => {
    const heldAllWeek = trade({
      openDate: '2026-03-02',
      date: '2026-03-06',
      expiration: '2026-03-06',
      assetType: 'option',
    });

    expect(daysToExpiry(heldAllWeek)).not.toBe(0);
  });

  it('falls back to the close for a trade imported before the field existed', () => {
    // Exact for a day trade, which is the overwhelming majority here, and the old behaviour for
    // anything held overnight — rather than refusing to say anything about an existing journal.
    const sameDay = trade({ date: '2026-03-06', expiration: '2026-03-06', assetType: 'option' });
    expect(daysToExpiry(sameDay)).toBe(0);
  });

  it('still refuses an expiry before the fill', () => {
    const impossible = trade({ openDate: '2026-03-10', date: '2026-03-10', expiration: '2026-03-06' });
    expect(daysToExpiry(impossible)).toBeNull();
  });
});
