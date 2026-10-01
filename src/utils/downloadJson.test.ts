import { readFileSync } from 'node:fs';
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

describe('one download sequence, used by every saver', () => {
  /*
   * There were three copies of the anchor dance and two of them had both faults this module exists to
   * fix: the anchor never put in the document, and the blob URL revoked on the same tick as the
   * click, which WebKit treats as a cancelled download.
   *
   * The CSV exports (trades, and the year-end tax file) and the share-card PNG are all buttons
   * somebody presses expecting a file. The share card was the worst of them: it returned 'downloaded'
   * unconditionally, so a browser that refused the save was reported as a success.
   *
   * Asserted on the source, because a jsdom-free node test cannot exercise an anchor click — and
   * because what is being pinned is the absence of a fourth copy.
   */
  const CALLERS = [
    'src/utils/exportTrades.ts',
    'src/utils/shareCard.ts',
  ];

  it.each(CALLERS)('%s goes through saveBlob', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain("from './downloadJson'");
    expect(source).toContain('saveBlob(');
  });

  it.each(CALLERS)('%s builds no anchor of its own', (file) => {
    /*
     * The anchor is the tell. Scoped to that rather than to revokeObjectURL, because shareCard
     * legitimately revokes an object URL elsewhere — the <img> source it draws onto a canvas, inside
     * a finally. A blunter assertion flagged that as a regression, which is the same trap that caught
     * two other source tests today.
     */
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(source).not.toMatch(/createElement\(\s*'a'\s*\)/);
  });

  it('reports a refused save instead of claiming the file arrived', () => {
    const shareCard = readFileSync('src/utils/shareCard.ts', 'utf8');
    // saveBlob throws when it cannot save; the caller must turn that into 'failed', not 'downloaded'.
    expect(shareCard).toMatch(/catch \{\s*return 'failed';/);

    const modal = readFileSync('src/components/ShareCardModal.tsx', 'utf8');
    expect(modal).toContain("result === 'failed'");
  });
});
