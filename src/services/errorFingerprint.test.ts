import { describe, expect, it } from 'vitest';
import {
  fingerprint,
  normalizeError,
  normalizeMessage,
  safePath,
  shouldReport,
  topAppFrame,
} from './errorFingerprint';

describe('shouldReport', () => {
  it('drops the noise that would otherwise dominate the feed', () => {
    // Cross-origin script errors carry nothing actionable, by design of the browser.
    expect(shouldReport({ kind: 'window', message: 'Script error.' })).toBe(false);
    expect(
      shouldReport({ kind: 'window', message: 'ResizeObserver loop completed with undelivered notifications.' }),
    ).toBe(false);
    // Chunk failures are already handled by ErrorBoundary's auto-reload.
    expect(
      shouldReport({ kind: 'render', message: 'Failed to fetch dynamically imported module: /assets/x.js' }),
    ).toBe(false);
    expect(shouldReport({ kind: 'promise', message: 'The operation was aborted.' })).toBe(false);
  });

  it('drops anything thrown from a browser extension', () => {
    expect(
      shouldReport({
        kind: 'window',
        message: 'wallet is not defined',
        stack: 'ReferenceError\n    at chrome-extension://abcdef/inject.js:1:1',
      }),
    ).toBe(false);
  });

  it('keeps a real application error', () => {
    expect(
      shouldReport({
        kind: 'render',
        message: "Cannot read properties of undefined (reading 'pnl')",
        stack: 'TypeError\n    at DashboardView (/assets/index-a1b2c3d4.js:44:12)',
      }),
    ).toBe(true);
  });

  it("drops Firestore's IndexedDB teardown, which iOS fires on every app switch", () => {
    expect(
      shouldReport({
        kind: 'promise',
        message:
          "InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.",
        stack: 'transaction@[native code]\n    at _withRetries (firebase-CSWbg9pq.js:1:91364)',
      }),
    ).toBe(false);
  });

  it('still reports a full disk, which is the same layer genuinely failing', () => {
    expect(
      shouldReport({
        kind: 'promise',
        message: "QuotaExceededError: Failed to execute 'transaction' on 'IDBDatabase'",
      }),
    ).toBe(true);
  });

  it('drops an empty message, which carries nothing to act on', () => {
    expect(shouldReport({ kind: 'window', message: '   ' })).toBe(false);
  });
});

describe('normalizeMessage', () => {
  it('strips the parts that change between occurrences of one bug', () => {
    const a = normalizeMessage('Request to https://api.example.com/trades/8fa21c failed in 1423ms');
    const b = normalizeMessage('Request to https://api.example.com/trades/91bd07 failed in 12ms');
    expect(a).toBe(b);
  });

  it('leaves a plain message recognisable', () => {
    expect(normalizeMessage("Cannot read properties of undefined (reading 'pnl')")).toBe(
      "Cannot read properties of undefined (reading 'pnl')",
    );
  });
});

describe('topAppFrame', () => {
  it('skips vendor frames and picks our own code', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'pnl')",
      '    at commitHookEffectListMount (https://trendchasers.net/assets/react-dom-9f8e7d6c.js:19:1)',
      '    at DashboardView (https://trendchasers.net/assets/index-a1b2c3d4.js:412:19)',
    ].join('\n');

    expect(topAppFrame(stack)).toContain('DashboardView');
    expect(topAppFrame(stack)).not.toContain('react-dom');
  });

  it('does not change when the bundle hash changes', () => {
    const frame = (hash: string) =>
      topAppFrame(
        `TypeError: x\n    at DashboardView (https://trendchasers.net/assets/index-${hash}.js:412:19)`,
      );
    expect(frame('a1b2c3d4')).toBe(frame('99887766'));
  });
});

describe('fingerprint', () => {
  const stack =
    "TypeError: Cannot read properties of undefined (reading 'pnl')\n" +
    '    at DashboardView (https://trendchasers.net/assets/index-a1b2c3d4.js:412:19)';

  it('groups two occurrences of the same bug', () => {
    const a = fingerprint({ kind: 'render', message: "Cannot read properties of undefined (reading 'pnl')", stack });
    const b = fingerprint({ kind: 'render', message: "Cannot read properties of undefined (reading 'pnl')", stack });
    expect(a).toBe(b);
  });

  it('separates different bugs', () => {
    const a = fingerprint({ kind: 'render', message: "reading 'pnl'", stack });
    const b = fingerprint({ kind: 'render', message: "reading 'symbol'", stack });
    expect(a).not.toBe(b);
  });

  it('separates the same message coming from two different handlers', () => {
    const a = fingerprint({ kind: 'server', message: 'Request failed', scope: 'broker-connect' });
    const b = fingerprint({ kind: 'server', message: 'Request failed', scope: 'creem-webhook-apply' });
    expect(a).not.toBe(b);
  });

  it('is a 16-character hex string, usable as a Firestore document id', () => {
    expect(fingerprint({ kind: 'window', message: 'boom' })).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('normalizeError', () => {
  it('handles a thrown Error', () => {
    const err = new TypeError('boom');
    const out = normalizeError(err, 'render');
    expect(out.name).toBe('TypeError');
    expect(out.message).toBe('boom');
    expect(out.kind).toBe('render');
  });

  it('handles a thrown string, which is what a rejected promise often carries', () => {
    const out = normalizeError('something went wrong', 'promise');
    expect(out.message).toBe('something went wrong');
    expect(out.name).toBe('Error');
  });

  it('handles a thrown object without crashing', () => {
    const out = normalizeError({ code: 'permission-denied' }, 'promise');
    expect(out.message).toContain('permission-denied');
  });

  it('handles null and undefined', () => {
    expect(normalizeError(null, 'window').message).toBe('null');
    expect(normalizeError(undefined, 'window').message).toBe('undefined');
  });

  it('truncates a runaway stack', () => {
    const err = new Error('boom');
    err.stack = 'x'.repeat(10_000);
    expect(normalizeError(err, 'window').stack.length).toBeLessThanOrEqual(4000);
  });
});

describe('safePath', () => {
  it('drops the query string, which is where credentials end up', () => {
    expect(safePath('https://trendchasers.net/app?userSecret=abc123&tab=journal')).toBe('/app');
  });

  it('masks long id-looking path segments', () => {
    expect(safePath('https://trendchasers.net/coach/Xk29fMqPz01LmT4vBn7Yh3')).toBe('/coach/<id>');
  });

  it('keeps ordinary paths intact', () => {
    expect(safePath('https://trendchasers.net/brokers/charles-schwab')).toBe('/brokers/charles-schwab');
  });

  it('falls back to / for something unparseable', () => {
    expect(safePath('')).toBe('/');
  });
});
