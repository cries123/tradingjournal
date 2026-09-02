import { describe, expect, it } from 'vitest';
import { readTradeForm, type TradeFormDraft } from './tradeFormValues';

const blank: TradeFormDraft = {
  symbol: '', pnl: '', grossPnl: '', fees: '',
  mae: '', mfe: '', rMultiple: '', checklistScore: '', ivRank: '',
};

const draft = (over: Partial<TradeFormDraft>): TradeFormDraft => ({ ...blank, ...over });

describe('readTradeForm', () => {
  it('takes the typed net when gross and fees are not both given', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '260' }));
    expect(r.derivedNet).toBeNull();
    expect(r.net).toBe(260);
    expect(r.netRaw).toBe('260');
    expect(r.canSave).toBe(true);
  });

  /*
   * The bug this exists for: the old submit replaced the typed 260 with 295 and saved that,
   * showing 260 on screen the whole time.
   */
  it('derives the net from gross and fees, and shows the same number it will save', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '260', grossPnl: '300', fees: '5' }));
    expect(r.derivedNet).toBe(295);
    expect(r.net).toBe(295);
    expect(r.netRaw).toBe('295.00');
  });

  it('hands the net back the moment either part is cleared', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '260', grossPnl: '300', fees: '' }));
    expect(r.derivedNet).toBeNull();
    expect(r.net).toBe(260);
  });

  it('does not leave floating point dust in the derived net', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', grossPnl: '300.10', fees: '5.02' }));
    expect(r.derivedNet).toBe(295.08);
  });

  it('lets gross and fees alone supply the net, with nothing typed', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', grossPnl: '300', fees: '5' }));
    expect(r.net).toBe(295);
    expect(r.canSave).toBe(true);
  });

  it('accepts a figure pasted off a broker statement', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '($1,274.22)' }));
    expect(r.net).toBe(-1274.22);
    expect(r.canSave).toBe(true);
  });

  it('refuses a whitespace-only symbol, which used to save as a blank ticker', () => {
    const r = readTradeForm(draft({ symbol: '   ', pnl: '260' }));
    expect(r.errors.symbol).toBeDefined();
    expect(r.canSave).toBe(false);
  });

  it('says the P/L is missing rather than failing silently', () => {
    const r = readTradeForm(draft({ symbol: 'SPY' }));
    expect(r.errors.pnl).toContain('Enter the profit or loss');
    expect(r.canSave).toBe(false);
  });

  it('treats a zero P/L as a real answer', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '0' }));
    expect(r.net).toBe(0);
    expect(r.errors.pnl).toBeUndefined();
    expect(r.canSave).toBe(true);
  });

  it('flags a percentage outside 0-100 instead of storing it', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '1', checklistScore: '150' }));
    expect(r.errors.checklistScore).toBe('Checklist is 0-100');
    expect(r.values.checklistScore).toBeUndefined();
    expect(r.canSave).toBe(false);
  });

  it('counts errors hiding inside Advanced, so submit can open it', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '1', mae: 'abc', ivRank: '900' }));
    expect(r.advancedErrorCount).toBe(2);
    expect(r.canSave).toBe(false);
  });

  it('does not count the two always-visible fields as advanced errors', () => {
    const r = readTradeForm(draft({ symbol: '', pnl: 'oops' }));
    expect(r.advancedErrorCount).toBe(0);
    expect(r.canSave).toBe(false);
  });

  it('an unreadable gross does not silently derive a net', () => {
    const r = readTradeForm(draft({ symbol: 'SPY', pnl: '260', grossPnl: 'abc', fees: '5' }));
    expect(r.derivedNet).toBeNull();
    expect(r.errors.grossPnl).toBe('Not a number');
    expect(r.canSave).toBe(false);
  });
});
