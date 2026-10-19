import { describe, expect, it } from 'vitest';
import { parseAnswer, parseInline, splitHeadline } from './assistantFormat';

describe('parseAnswer tables', () => {
  const answer = [
    'Split by where each trade fell in its day:',
    '',
    '| Trades | Count | Win % | Net |',
    '|---|---:|---:|---:|',
    '| 1st to 3rd | 17 | 41% | -$501.46 |',
    '| 4th and later | 9 | 22% | **-$1,284.40** |',
    '',
    '- Three of five red days broke the cap.',
  ].join('\n');

  it('draws a pipe table as a table, between the paragraph and the list', () => {
    // These arrived on screen as rows of pipes and dashes inside a paragraph.
    const blocks = parseAnswer(answer);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'list']);
    const table = blocks[1];
    if (table.kind !== 'table') throw new Error('not a table');
    expect(table.header.map((cell) => cell.map((s) => s.text).join(''))).toEqual(['Trades', 'Count', 'Win %', 'Net']);
    expect(table.rows).toHaveLength(2);
  });

  it('right-aligns only the columns that are all figures', () => {
    const table = parseAnswer(answer)[1];
    if (table.kind !== 'table') throw new Error('not a table');
    expect(table.numeric).toEqual([false, true, true, true]);
  });

  it('colours a figure in a cell by its sign, bolded or not', () => {
    const table = parseAnswer(answer)[1];
    if (table.kind !== 'table') throw new Error('not a table');
    expect(table.rows[0][3]).toEqual([{ kind: 'figure', text: '-$501.46', positive: false }]);
    expect(table.rows[1][3]).toEqual([{ kind: 'figure', text: '-$1,284.40', positive: false }]);
  });

  it('keeps pipes without a rule under them in the paragraph they were in', () => {
    // Exactly as before tables were read. Also what a table is for a moment while it streams in.
    const blocks = parseAnswer('Before\n| not | a table |\nstill a sentence');
    expect(blocks).toEqual([{ kind: 'paragraph', segments: [{ kind: 'text', text: 'Before | not | a table | still a sentence' }] }]);
  });

  it('closes the paragraph before a real table, in order', () => {
    const blocks = parseAnswer('Split like this:\n| A | B |\n|---|---|\n| x | 1 |\nAfter.');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
  });

  it('takes a rule written without outer pipes', () => {
    const blocks = parseAnswer('| A | B |\n---|---\n| x | 1 |');
    expect(blocks.map((b) => b.kind)).toEqual(['table']);
  });

  it('pads a short row rather than dropping its cells', () => {
    const table = parseAnswer('| A | B | C |\n|---|---|---|\n| x | 1 |')[0];
    if (table.kind !== 'table') throw new Error('not a table');
    expect(table.rows[0]).toHaveLength(3);
  });
});

describe('splitHeadline', () => {
  it('lifts an opening line that is one bold sentence into the headline', () => {
    const { headline, rest } = splitHeadline(parseAnswer('**Mostly the trades after your third.**\n\nSeptember closed red.'));
    expect(headline).toBe('Mostly the trades after your third.');
    expect(rest.map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('leaves a sentence with a bold phrase in it as a sentence', () => {
    expect(splitHeadline(parseAnswer('You **overtrade** on red days.')).headline).toBeNull();
    // Bold first and more after it is a paragraph that opens with emphasis, not a title.
    expect(splitHeadline(parseAnswer('**Overtrading.** It cost you -$400 this month.')).headline).toBeNull();
  });

  it('leaves a bolded figure as a figure', () => {
    expect(splitHeadline(parseAnswer('**-$553.27**')).headline).toBeNull();
  });

  it('invents nothing when the answer has no such line', () => {
    const blocks = parseAnswer('Three trades, all before your cap.');
    expect(splitHeadline(blocks)).toEqual({ headline: null, rest: blocks });
  });
});

describe('parseInline', () => {
  it('colours a bolded figure by its sign, like an unbolded one', () => {
    // The model bolds most of the figures it quotes; those are the ones the colouring must not miss.
    expect(parseInline('averaged **-$553.27** against **+$2.72**')).toEqual([
      { kind: 'text', text: 'averaged ' },
      { kind: 'figure', text: '-$553.27', positive: false },
      { kind: 'text', text: ' against ' },
      { kind: 'figure', text: '+$2.72', positive: true },
    ]);
  });

  it('leaves an unsigned bolded figure uncoloured', () => {
    // Only an explicit sign decides tone — "**$412.55**" is not a loss because a loss is nearby.
    expect(parseInline('**$412.55**')).toEqual([{ kind: 'figure', text: '$412.55', positive: null }]);
  });

  it('keeps bold that is words, or words around a figure, as bold', () => {
    expect(parseInline('**Overtrading on red days.**')).toEqual([{ kind: 'bold', text: 'Overtrading on red days.' }]);
    expect(parseInline('**down -$40 today**')).toEqual([{ kind: 'bold', text: 'down -$40 today' }]);
  });

  it('still finds figures outside bold', () => {
    expect(parseInline('lost -$5,155.27 on puts')).toEqual([
      { kind: 'text', text: 'lost ' },
      { kind: 'figure', text: '-$5,155.27', positive: false },
      { kind: 'text', text: ' on puts' },
    ]);
  });
});
