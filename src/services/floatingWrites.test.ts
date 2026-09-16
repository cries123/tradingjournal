import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * `void someFirestoreWrite()` with nothing catching it.
 *
 * This is the recurring bug in this codebase and it has now cost four fixes: two trade writes, the
 * settings write, and the profile sync that produced the "FirebaseError: Missing or insufficient
 * permissions" rows in the error feed. It is hard to spot in review because the broken version and
 * the correct version differ by six characters, and it is hard to diagnose afterwards because the
 * rejection arrives in the global handler carrying nothing but minified SDK frames — no app code,
 * no scope, no clue which write it was.
 *
 * The helpers below all reach Firestore and none of them swallow their own failures, so a bare
 * `void` on any of them is a future anonymous row. Catch it and pass a scope, the way
 * settings-save and profile-sync do; the scope is the entire difference between a report somebody
 * can act on and one nobody can place.
 *
 * Helpers that DO swallow internally are deliberately absent from this list — recordAnonymousVisit,
 * recordAdminHealthSnapshot and deleteShareCardBackground each wrap themselves in try/catch, so a
 * bare `void` on those is correct and adding them here would be noise.
 */

const WRITERS = [
  'ensureUserProfile',
  'markTicketRead',
  'updateTicketStatus',
  'markCoachNotesRead',
  'claimUsername',
  'saveTradesBatch',
  'saveTrade',
  'setDoc',
  'updateDoc',
  'deleteDoc',
  'addDoc',
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) {
      found.push(full);
    }
  }
  return found;
}

/** The text from `void name(` through the closing paren of that call. */
function callEndsAt(source: string, openParen: number): number {
  let depth = 0;
  for (let i = openParen; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

describe('floating Firestore writes', () => {
  it('are always caught, so a failure arrives with a scope on it', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf-8');

      for (const writer of WRITERS) {
        const needle = `void ${writer}(`;
        let from = 0;
        for (;;) {
          const at = source.indexOf(needle, from);
          if (at === -1) break;
          from = at + 1;

          const end = callEndsAt(source, at + needle.length - 1);
          if (end === -1) continue;
          // What follows the call: `.catch(` has to be the very next thing, allowing for the
          // whitespace and line break a formatter may have put there.
          const after = source.slice(end + 1, end + 12);
          if (!/^\s*\.catch\b/.test(after)) {
            const line = source.slice(0, at).split('\n').length;
            offenders.push(`${file.replace(process.cwd(), '').replace(/\\/g, '/')}:${line} — void ${writer}()`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
