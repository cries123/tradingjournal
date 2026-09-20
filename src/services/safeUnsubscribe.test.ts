import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A listener teardown that throws takes the whole app down.
 *
 * React runs effect cleanups during commit, so a cleanup that throws is not caught by anything on
 * the way out — it leaves the commit phase and the ErrorBoundary paints the crash screen. Every
 * listener in this app is torn down that way, most of them as a bare `return unsub`.
 *
 * Firestore 12.15.0 made that concrete: INTERNAL ASSERTION FAILED (ID: b815), raised from inside
 * its own IndexedDB layer, surfaced through a support-ticket unsubscribe and was logged as a
 * RENDER CRASH — a real user, on /app, watching a working journal turn into an error screen
 * because a listener could not be detached.
 */

const reported: { scope: string | null }[] = [];

vi.mock('./errorReporting', () => ({
  reportErrorSilently: (_err: unknown, _kind: string, scope: string | null) => {
    reported.push({ scope });
  },
}));

const { safeUnsubscribe } = await import('./safeUnsubscribe');

beforeEach(() => {
  reported.length = 0;
});

describe('safeUnsubscribe', () => {
  it('passes a clean teardown straight through', () => {
    let called = 0;
    safeUnsubscribe(() => void called++, 'unsub-x')();

    expect(called).toBe(1);
    expect(reported).toEqual([]);
  });

  it('swallows a throwing teardown rather than letting it reach React', () => {
    const boom = () => {
      throw new Error('INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)');
    };

    expect(() => safeUnsubscribe(boom, 'unsub-x')()).not.toThrow();
  });

  it('reports the failure under its own scope, so the row is not another anonymous SDK stack', () => {
    safeUnsubscribe(() => {
      throw new Error('nope');
    }, 'unsub-trades')();

    expect(reported).toEqual([{ scope: 'unsub-trades' }]);
  });

  it('survives a teardown that throws a non-Error', () => {
    // The SDK assertion arrives as an Error, but nothing guarantees the next one will.
    expect(() =>
      safeUnsubscribe(() => {
        throw 'a string';
      }, 'unsub-x')(),
    ).not.toThrow();
    expect(reported).toHaveLength(1);
  });
});

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) found.push(full);
  }
  return found;
}

describe('every listener', () => {
  it('hands back a teardown that cannot throw', () => {
    const unwrapped: string[] = [];

    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf-8');
      let from = 0;
      for (;;) {
        const at = source.indexOf('onSnapshot(', from);
        if (at === -1) break;
        from = at + 1;

        /* The wrapper goes immediately around the onSnapshot call, so it is the text just before
           it — `return safeUnsubscribe(\n  onSnapshot(`. Checking backwards rather than parsing
           keeps this readable and cannot be fooled by a safeUnsubscribe further up the file. */
        const before = source.slice(Math.max(0, at - 60), at);
        if (!before.includes('safeUnsubscribe(')) {
          const line = source.slice(0, at).split('\n').length;
          unwrapped.push(`${file.replace(process.cwd(), '').replace(/\\/g, '/')}:${line}`);
        }
      }
    }

    expect(unwrapped).toEqual([]);
  });
});
