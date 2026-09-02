import { describe, expect, it } from 'vitest';
import { parseMoneyInput, roundMoney } from './parseMoneyInput';

const value = (raw: string) => {
  const parsed = parseMoneyInput(raw);
  return parsed.kind === 'value' ? parsed.value : parsed.kind;
};

describe('parseMoneyInput', () => {
  it('reads a plain number', () => {
    expect(value('260')).toBe(260);
    expect(value('260.00')).toBe(260);
    expect(value('-1274.22')).toBe(-1274.22);
    expect(value('.5')).toBe(0.5);
    expect(value('12.')).toBe(12);
  });

  it('accepts what a broker statement actually looks like', () => {
    expect(value('$260.00')).toBe(260);
    expect(value('$1,274.22')).toBe(1274.22);
    expect(value('1 274.22')).toBe(1274.22);
    expect(value('  $ 1,274.22  ')).toBe(1274.22);
  });

  it('reads accounting parentheses as a loss', () => {
    expect(value('(1,274.22)')).toBe(-1274.22);
    expect(value('($260.00)')).toBe(-260);
  });

  it('does not double-negate a minus inside parentheses', () => {
    expect(value('(-260)')).toBe(-260);
  });

  it('keeps zero distinct from blank', () => {
    expect(parseMoneyInput('0')).toEqual({ kind: 'value', value: 0 });
    expect(parseMoneyInput('')).toEqual({ kind: 'empty' });
    expect(parseMoneyInput('   ')).toEqual({ kind: 'empty' });
  });

  it('rejects a typo instead of reading the number it starts with', () => {
    // parseFloat('12abc') is 12, which would save a trade the person never entered.
    expect(parseMoneyInput('12abc')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('abc')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('1.2.3')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('--5')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('$')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('()')).toEqual({ kind: 'invalid' });
  });

  it('rejects the infinities and NaN spellings JavaScript would otherwise accept', () => {
    expect(parseMoneyInput('Infinity')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('1e400')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('NaN')).toEqual({ kind: 'invalid' });
  });
});

describe('roundMoney', () => {
  it('clears the floating point residue left by subtracting fees', () => {
    expect(roundMoney(300.1 - 5.02)).toBe(295.08);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('leaves an exact figure alone', () => {
    expect(roundMoney(295)).toBe(295);
    expect(roundMoney(-1274.22)).toBe(-1274.22);
  });
});
