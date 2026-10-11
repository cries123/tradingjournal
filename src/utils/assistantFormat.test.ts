import { describe, expect, it } from 'vitest';
import { parseInline } from './assistantFormat';

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
