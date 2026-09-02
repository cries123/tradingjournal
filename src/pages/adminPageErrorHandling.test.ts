import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A source scan, not a render test.
 *
 * Every mutating handler on the admin page is invoked as `void handleSomething(...)` from an
 * onClick. When one of them was written as `try { await … } finally { … }` with no `catch`, a
 * refused Firestore write became an unhandled promise rejection: reported to the error feed as a
 * bare "Missing or insufficient permissions." attributed to /admin rather than to the button, and
 * invisible in the UI, which just stopped spinning. That shipped. This locks the shape closed.
 */
const source = readFileSync(join(process.cwd(), 'src/pages/AdminPage.tsx'), 'utf-8');

/**
 * The one handler that is supposed to reject.
 *
 * It returns the saved note to the user-detail modal, which awaits it and has its own error line,
 * so swallowing the failure here would leave the modal showing a note the server rejected. Adding
 * a name to this set is a decision about where the failure gets shown — not a way past the check.
 */
const REJECTS_BY_CONTRACT = new Set(['handleUserNoteSave']);

describe('AdminPage failure handling', () => {
  it('has no await-with-cleanup that lacks a failure path', () => {
    const offenders = [...source.matchAll(/\btry \{.*?\} finally \{/gs)]
      .filter((m) => !m[0].includes('} catch'))
      .map((m) => source.slice(0, m.index).split('\n').length);

    expect(offenders, `try/finally without catch at line(s) ${offenders.join(', ')}`).toEqual([]);
  });

  it('keeps busy-key bookkeeping in one place, so no handler can reintroduce its own', () => {
    // Two: the setter inside runAdminAction, and the reset in its finally. The useState line
    // declares the setter and does not call it.
    const calls = [...source.matchAll(/setUpdatingKey\(/g)].length;
    expect(calls).toBe(2);
  });

  it('leaves no mutating handler able to reject into its caller', () => {
    const starts = [...source.matchAll(/^ {2}const (handle\w+) = /gm)];
    const rejectable = starts
      .map((m, i) => {
        const from = m.index ?? 0;
        const to = i + 1 < starts.length ? (starts[i + 1].index ?? source.length) : source.length;
        return { name: m[1], body: source.slice(from, to) };
      })
      // A handler that never awaits has nothing to reject.
      .filter(({ body }) => body.includes('await '))
      // Either the shared wrapper catches for it, or it catches for itself. Both are fine.
      .filter(({ body }) => !body.includes('runAdminAction(') && !body.includes('} catch'))
      .map(({ name }) => name)
      .filter((name) => !REJECTS_BY_CONTRACT.has(name));

    expect(rejectable).toEqual([]);
  });
});
