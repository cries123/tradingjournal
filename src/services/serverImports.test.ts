import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Nothing in the browser bundle may import a value from server/.
 *
 * server/ modules import the Firebase Admin SDK, which is Node-only. A component importing a
 * function from one pulls `firebase-admin` into the browser bundle, and the page dies on load with
 * a blank error card — which is what happened to the live admin page the day the journal-history
 * panel shipped.
 *
 * Nothing caught it. All four typechecks passed, because a TypeScript import is a TypeScript
 * import. eslint passed. All 960 tests passed, because tests run in Node where firebase-admin
 * loads perfectly well. The failure exists only in a browser, and the only signal was a screenshot
 * from the owner.
 *
 * `import type` stays allowed: types are erased before a bundle exists. Only value imports pull
 * the module in.
 */

/* fileURLToPath, not URL.pathname: a checkout under a folder with a space in its name comes back
   percent-encoded, and readdirSync then goes looking for 'blackbook%20CRM'. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every import statement in a file, each collapsed onto one line.
 *
 * Accumulated line by line rather than matched in one pass. The first version put a lazy
 * [\s\S]*? between "import" and the server path, which happily spanned three unrelated imports to
 * reach one and then reported the whole run as a single offending statement — flagging two files
 * whose server import was type-only.
 */
function importStatements(source: string): string[] {
  const out: string[] = [];
  let current: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    if (current.length === 0 && !/^\s*import\b/.test(line)) continue;
    current.push(line.trim());
    if (/;\s*$/.test(line)) {
      out.push(current.join(' ').replace(/\s+/g, ' '));
      current = [];
    }
  }

  return out;
}

/** Value imports from server/, ignoring `import type`. */
function serverValueImports(source: string): string[] {
  return importStatements(source).filter((statement) => {
    if (!/from\s+'[^']*server\/[^']*'/.test(statement)) return false;
    if (/^import\s+type\b/.test(statement)) return false;

    // `import { type Foo, bar }` still imports bar; `import { type Foo }` imports nothing.
    const braces = statement.match(/\{([\s\S]*?)\}/);
    if (!braces) return true;

    const named = braces[1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const hasValue = named.some((n) => !n.startsWith('type '));
    const hasDefaultOrNamespace = /^import\s+[^{\s]/.test(statement);
    return hasValue || hasDefaultOrNamespace;
  });
}

describe('the browser bundle', () => {
  const files = sourceFiles(join(ROOT, 'src'));

  it('finds the source tree, so the check below is not vacuous', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never imports a value from server/', () => {
    const offenders: string[] = [];

    for (const file of files) {
      // Tests run in Node and never reach a bundle, so they may import server code freely.
      if (/\.test\.tsx?$/.test(file)) continue;

      for (const statement of serverValueImports(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(ROOT, file)}: ${statement}`);
      }
    }

    expect(
      offenders,
      `these pull firebase-admin into the browser bundle — move the shared part into src/ and ` +
        `import the type only:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('allows a type-only import, which is erased before bundling', () => {
    expect(serverValueImports("import type { Foo } from '../../server/thing';")).toEqual([]);
    expect(serverValueImports("import { type Foo } from '../../server/thing';")).toEqual([]);
  });

  it('does not let one statement bleed into the next', () => {
    // The bug in the first version of this file: a value import followed later by a type import
    // from server/ was reported as one offending statement.
    const source = [
      "import { useState } from 'react';",
      "import { thing } from '../../services/thing';",
      "import type { Foo } from '../../server/thing';",
    ].join('\n');

    expect(serverValueImports(source)).toEqual([]);
  });

  it('catches the shape that actually broke the admin page', () => {
    expect(
      serverValueImports(
        "import { describeEvent, wasWasted, type JournalEvent } from '../../../server/journalEvents';",
      ),
    ).toHaveLength(1);
  });

  it('catches a multi-line value import too', () => {
    const source = ['import {', '  describeEvent,', "} from '../../server/journalEvents';"].join(
      '\n',
    );
    expect(serverValueImports(source)).toHaveLength(1);
  });
});
