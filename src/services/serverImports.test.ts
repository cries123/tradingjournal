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
    // `export { x } from` and `export * from` pull a module in exactly as `import` does, and the
    // first version of this file watched only for `import`.
    if (current.length === 0 && !/^\s*(import|export)\b/.test(line)) continue;

    current.push(line.trim());

    /*
     * Terminated on the quote that closes the module path, not on a semicolon.
     *
     * A statement ending in a trailing comment never reaches its `;` at end-of-line, so the
     * accumulator ran on and swallowed the rest of the file into one "statement" — which then
     * matched nothing and reported nothing.
     */
    const joined = current.join(' ').replace(/\s+/g, ' ');
    if (/from\s+['"][^'"]*['"]/.test(joined) || /;\s*$/.test(line)) {
      out.push(joined);
      current = [];
    }
  }

  return out;
}

/** Value imports from server/, ignoring `import type`. */
/**
 * Packages that only exist in Node. Importing one into src/ is the same defect by a shorter
 * route — it does not need a server/ file in between to white-screen the page.
 */
const NODE_ONLY = /from\s+['"](firebase-admin|@netlify\/functions|node:[a-z]+|fs|path|crypto)(\/[^'"]*)?['"]/;

/** A path into server/, in either quote style, with or without a trailing segment. */
const SERVER_PATH = /from\s+['"][^'"]*(\/|^)server(\/[^'"]*)?['"]/;

function serverValueImports(source: string): string[] {
  return importStatements(source).filter((statement) => {
    if (!SERVER_PATH.test(statement) && !NODE_ONLY.test(statement)) return false;
    if (/^(import|export)\s+type\b/.test(statement)) return false;

    // `import { type Foo, bar }` still imports bar; `import { type Foo }` imports nothing.
    const braces = statement.match(/\{([\s\S]*?)\}/);
    if (!braces) return true;

    const named = braces[1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const hasValue = named.some((n) => !n.startsWith('type '));
    const hasDefaultOrNamespace = /^import\s+[^{\s]/.test(statement);
    // `export * from '…'` and `export { x } from '…'` re-export values by definition.
    const isReExport = /^export\b/.test(statement);
    return hasValue || hasDefaultOrNamespace || isReExport;
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

  it('catches a double-quoted path, which the first version let through', () => {
    expect(serverValueImports('import { thing } from "../../server/thing";')).toHaveLength(1);
  });

  it('catches a bare server path with no trailing segment', () => {
    expect(serverValueImports("import { thing } from '../../server';")).toHaveLength(1);
  });

  it('catches a re-export, which pulls the module in exactly as an import does', () => {
    expect(serverValueImports("export { thing } from '../../server/thing';")).toHaveLength(1);
    expect(serverValueImports("export * from '../../server/thing';")).toHaveLength(1);
  });

  it('allows a type-only re-export', () => {
    expect(serverValueImports("export type { Foo } from '../../server/thing';")).toEqual([]);
  });

  it('catches a Node-only package imported straight into src/', () => {
    // The shorter route to the same white screen: no server/ file needed in between.
    expect(serverValueImports("import admin from 'firebase-admin';")).toHaveLength(1);
  });

  it('does not run past a statement that ends in a comment', () => {
    /*
     * The accumulator used to flush only on a line-ending semicolon, so a trailing comment made
     * it swallow the rest of the file into one unmatchable blob — the guard went quiet rather
     * than loud, which is the worst way for a guard to fail.
     */
    const source = [
      "import { a } from './a'; // why",
      "import { describeEvent } from '../../server/journalEvents';",
    ].join('\n');

    expect(serverValueImports(source)).toHaveLength(1);
  });

  it('catches a multi-line value import too', () => {
    const source = ['import {', '  describeEvent,', "} from '../../server/journalEvents';"].join(
      '\n',
    );
    expect(serverValueImports(source)).toHaveLength(1);
  });
});
