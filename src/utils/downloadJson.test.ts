import { describe, expect, it } from 'vitest';
import { buildJsonFile } from './downloadJson';

/*
 * Only the half that can be tested in a node environment: what the file is called and what is in
 * it. The DOM half is one shared copy precisely because it cannot be covered here — two copies of
 * a browser workaround drift, and the one nobody is looking at is the one that breaks.
 */

describe('buildJsonFile', () => {
  it('stamps the file with the day it was made', () => {
    const file = buildJsonFile('trend-chasers-backup', '2026-09-29T21:14:02.000Z', { a: 1 });
    expect(file.filename).toBe('trend-chasers-backup-2026-09-29.json');
  });

  it('still produces a usable name when the timestamp is not a date', () => {
    // A filename is not worth throwing over, and a file called "...-undefined.json" or one with a
    // stray slash in it is worse than a generic name.
    expect(buildJsonFile('export', '', {}).filename).toBe('export-export.json');
    expect(buildJsonFile('export', 'today', {}).filename).toBe('export-export.json');
  });

  it('writes JSON a person can read, and reads back as the same data', () => {
    const data = { removedAt: '2026-09-29T21:14:02.000Z', trades: [{ id: 't1', pnl: -42 }] };
    const file = buildJsonFile('removed', '2026-09-29T21:14:02.000Z', data);

    // Indented on purpose: these get opened by the person who downloaded them, and emailed to me.
    expect(file.text).toContain('\n  ');
    expect(JSON.parse(file.text)).toEqual(data);
  });
});
