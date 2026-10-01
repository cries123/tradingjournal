import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csvCell } from './csvCell';

/*
 * One escaped CSV field. There were two copies of this and they disagreed about the newline.
 *
 * The trade export's copy quoted only on a comma or a quote, so a newline passed through raw. Notes
 * are typed into a textarea and `notes` is the seventh of twenty-one columns, so a two-line note split
 * the record and every field after it — prices, quantity, fees, gross, grade, times, MAE, MFE, R
 * multiple, checklist, asset class, journal — landed on a second line that a parser reads as a new row
 * whose date column is prose. That file goes to an accountant.
 */

describe('csvCell', () => {
  it('quotes a field containing a newline', () => {
    // The bug, in one assertion.
    expect(csvCell('faded the open\nsized down after')).toBe('"faded the open\nsized down after"');
  });

  it('quotes a field containing a carriage return', () => {
    // A note pasted from Windows or a web page carries CRLF, and a bare CR ends a record in most
    // parsers just as effectively.
    expect(csvCell('line one\r\nline two')).toBe('"line one\r\nline two"');
    expect(csvCell('line one\rline two')).toBe('"line one\rline two"');
  });

  it('still quotes commas and doubles embedded quotes', () => {
    expect(csvCell('SPY, 660C')).toBe('"SPY, 660C"');
    expect(csvCell('said "nope"')).toBe('"said ""nope"""');
  });

  it('leaves an ordinary field alone', () => {
    // Quoting everything would be valid CSV and unreadable in a text editor, which is where somebody
    // checks these before sending them on.
    expect(csvCell('SPY')).toBe('SPY');
    expect(csvCell(-412.5)).toBe('-412.5');
  });

  it('writes nothing for an absent value', () => {
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('joins a list without colliding with the delimiter', () => {
    // Tags are an array; a comma join would need quoting and reads worse in a spreadsheet.
    expect(csvCell(['reversal', 'late entry'])).toBe('reversal;late entry');
  });
});

describe('both exports use the one copy', () => {
  it('leaves no second escaper to drift', () => {
    /*
     * The chunk-error lesson, which this repo has already paid for: two copies of an escaping rule
     * drift, and the one nobody is looking at is the one that breaks. Asserted on the source because
     * the failure is a SECOND definition appearing, which no behavioural test can see.
     */
    for (const file of ['src/utils/exportTrades.ts', 'src/utils/taxReport.ts']) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain("from './csvCell'");
      expect(source, file).not.toMatch(/function (csvCell|cell)\(/);
    }
  });
});
