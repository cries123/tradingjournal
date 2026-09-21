import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { DayNote } from '../services/dayNotes';
import { countMatches, searchJournal } from './searchJournal';

let seq = 0;
const trade = (over: Partial<Trade> = {}): Trade =>
  ({ id: `t${seq++}`, date: '2026-09-01', symbol: 'SPY', pnl: 100, ...over }) as Trade;

const note = (date: string, text: string): DayNote => ({ date, note: text, updatedAt: '' });

describe('searchJournal', () => {
  it('finds a trade by symbol', () => {
    const hits = searchJournal({ trades: [trade({ symbol: 'ES' }), trade()], notes: [], query: 'ES' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('trade');
  });

  it('finds a trade by something written in its note', () => {
    const hits = searchJournal({
      trades: [trade({ notes: 'sized up way too early, revenge after the open' })],
      notes: [],
      query: 'revenge',
    });
    expect(hits[0]?.excerpt).toContain('revenge');
  });

  it('finds a day note', () => {
    const hits = searchJournal({ trades: [], notes: [note('2026-09-02', 'chased a gap, bad day')], query: 'chased' });
    expect(hits[0]).toMatchObject({ kind: 'note', date: '2026-09-02' });
  });

  it('requires every term, not any of them', () => {
    // "ES revenge" should find the trade that is both, not everything mentioning either — an OR
    // search over a journal returns most of the journal.
    const trades = [
      trade({ symbol: 'ES', notes: 'clean setup' }),
      trade({ symbol: 'SPY', notes: 'revenge trade' }),
      trade({ symbol: 'ES', notes: 'revenge trade after the loss' }),
    ];
    const hits = searchJournal({ trades, notes: [], query: 'es revenge' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.excerpt).toContain('after the loss');
  });

  it('ignores case and does not care which field matched which term', () => {
    const hits = searchJournal({
      trades: [trade({ symbol: 'SPY', notes: 'Oversized entry' })],
      notes: [],
      query: 'spy OVERSIZED',
    });
    expect(hits).toHaveLength(1);
  });

  it('searches tags, setup and grade too', () => {
    const trades = [trade({ tags: ['GAP'] }), trade({ setup: 'BREAKOUT' }), trade({ grade: 'D' })];
    expect(searchJournal({ trades, notes: [], query: 'gap' })).toHaveLength(1);
    expect(searchJournal({ trades, notes: [], query: 'breakout' })).toHaveLength(1);
  });

  it('returns nothing for a query too short to mean anything', () => {
    // One character matches most of a journal, which is not a result, it is the whole list.
    const trades = [trade({ symbol: 'SPY' })];
    expect(searchJournal({ trades, notes: [], query: 's' })).toEqual([]);
    expect(searchJournal({ trades, notes: [], query: '   ' })).toEqual([]);
  });

  it('puts the newest match first', () => {
    const trades = [
      trade({ date: '2026-08-01', notes: 'gap fill' }),
      trade({ date: '2026-09-20', notes: 'gap fill' }),
    ];
    expect(searchJournal({ trades, notes: [], query: 'gap' })[0]?.date).toBe('2026-09-20');
  });

  it('mixes trades and notes in one list, newest first', () => {
    const hits = searchJournal({
      trades: [trade({ date: '2026-09-01', notes: 'chop' })],
      notes: [note('2026-09-10', 'chop all session')],
      query: 'chop',
    });
    expect(hits.map((h) => h.kind)).toEqual(['note', 'trade']);
  });

  it('caps the list but counts them all', () => {
    const trades = Array.from({ length: 80 }, (_, i) =>
      trade({ date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, notes: 'gap' }),
    );
    const input = { trades, notes: [], query: 'gap' };

    expect(searchJournal(input)).toHaveLength(60);
    // The UI says "showing 60 of 80" off this, so it has to count past the cap.
    expect(countMatches(input)).toBe(80);
  });

  it('trims a long note around the match rather than from the start', () => {
    // A hit 400 characters into a note is invisible if the excerpt starts at the beginning.
    const long = `${'x'.repeat(400)} the revenge trade ${'y'.repeat(400)}`;
    const hits = searchJournal({ trades: [], notes: [note('2026-09-01', long)], query: 'revenge' });
    expect(hits[0]?.excerpt).toContain('revenge');
    expect(hits[0]?.excerpt.length).toBeLessThan(200);
  });

  it('survives trades with nothing written on them', () => {
    expect(() => searchJournal({ trades: [trade({ notes: undefined })], notes: [], query: 'spy' })).not.toThrow();
  });
});
