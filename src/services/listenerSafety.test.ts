import { readFileSync, globSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = globSync('src/**/*.{ts,tsx}', { cwd: process.cwd() })
  .filter((f) => !f.includes('.test.'))
  .map((f) => ({ path: f, source: readFileSync(join(process.cwd(), f), 'utf-8') }));

/** Text of one call's argument list, from the opening paren to its match. */
function argsOf(source: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return '';
}

/**
 * The call's real arguments, split on commas at nesting depth zero.
 *
 * Empty segments are dropped, which is the whole point: this codebase uses trailing commas, so
 * counting separators and adding one reported a two-argument call as three — and the first
 * mutation run proved it, passing a listener whose error handler had just been deleted.
 */
function topLevelArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of args) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.filter((p) => p.trim().length > 0);
}

describe('Firestore listeners', () => {
  /*
   * The trades listener shipped as onSnapshot(ref, onNext) with no third argument. Firestore has
   * nowhere to deliver a listen failure in that shape, so it delivers it nowhere: the callback
   * stops firing and the journal keeps rendering its last snapshot as though it were current. A
   * paying customer spent two days watching syncs disappear into it.
   */
  it('always have somewhere to report a failure', () => {
    const bare: string[] = [];

    for (const { path, source } of files) {
      let from = 0;
      for (;;) {
        const at = source.indexOf('onSnapshot(', from);
        if (at === -1) break;
        from = at + 1;
        const open = at + 'onSnapshot'.length;
        const count = topLevelArgs(argsOf(source, open)).length;
        // (query, onNext, onError) — anything shorter cannot report a failure.
        if (count < 3) {
          bare.push(`${path}: onSnapshot with ${count} argument${count === 1 ? '' : 's'}`);
        }
      }
    }

    expect(bare, 'these listeners fail silently').toEqual([]);
  });
});

describe('broker sync', () => {
  const sync = files.find((f) => f.path.endsWith('BrokerConnectContent.tsx'))!.source;

  /*
   * onImportTrades was typed `=> void` while the implementation was async, so the call floated:
   * the "Imported N trades" message was printed before the write had happened and regardless of
   * whether it worked, and the rejection landed nowhere. The sync was spent either way.
   */
  it('waits for the trades to be saved before claiming they were imported', () => {
    expect(sync).toContain('await onImportTrades(');

    const importAt = sync.indexOf('await onImportTrades(');
    const claimAt = sync.indexOf('`Imported ${freshTrades.length}');
    expect(importAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(importAt);
  });

  it('lets a save failure be caught rather than floating', () => {
    // The prop type must admit a promise, or awaiting it is a lie the compiler allows.
    expect(sync).toMatch(/onImportTrades:\s*\(trades: Trade\[\]\)\s*=>\s*void \| Promise<void>/);
  });
});
