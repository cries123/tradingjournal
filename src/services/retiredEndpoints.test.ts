import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Endpoints that outlived the button that called them.
 *
 * Twice now. netlify.toml maps /api/* onto /.netlify/functions/*, so a function file is a public URL
 * for as long as it exists — removing the UI that called it changes nothing about who can call it.
 *
 *   - /api/start-trial granted a week of Silver, no card, to any signed-in account, for a month after
 *     the trial moved to Creem.
 *   - /api/parse-screenshot sent any signed-in account's image to OpenAI on the server's own key, free
 *     plan included, after the screenshot import was dropped. Its "20 per hour" was a Map in the
 *     function's memory: per warm instance, emptied on every cold start, shared with nothing.
 *
 * Both are pinned gone, and the second half of this file is the general version: every function has
 * to be either called by the app, scheduled, or named here as public on purpose.
 */

const FUNCTIONS = 'netlify/functions';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

function sourcesUnder(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourcesUnder(path, found);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) found.push(path);
  }
  return found;
}

describe('retired endpoints', () => {
  it('has no screenshot parser left to call OpenAI on our key', () => {
    expect(existsSync(join(FUNCTIONS, 'parse-screenshot.ts'))).toBe(false);
    expect(existsSync('server/parseApiHandler.ts')).toBe(false);
    expect(existsSync('server/parseScreenshot.ts')).toBe(false);
  });

  it('has no self-serve trial grant', () => {
    expect(existsSync(join(FUNCTIONS, 'start-trial.ts'))).toBe(false);
  });
});

describe('every function has a reason to exist', () => {
  /*
   * Called from the browser, run on a schedule, or reached from outside on purpose. A function that
   * is none of these is a public URL nobody is watching, which is exactly what both of the above
   * were.
   */
  const CALLED_FROM_OUTSIDE: Record<string, string> = {
    'creem-webhook': 'Creem posts billing events here, signature-checked',
    'email-unsubscribe': 'the link in the footer of the mail we send, token-checked',
    'record-preview': 'link-preview crawlers reading a published track record',
    health: 'uptime checks',
  };

  const client = sourcesUnder('src').map((p) => readFileSync(p, 'utf-8')).join('\n');

  for (const file of readdirSync(FUNCTIONS)) {
    const name = file.replace(/\.(m?ts)$/, '');
    it(`/${name} is called, scheduled, or public on purpose`, () => {
      const source = read(join(FUNCTIONS, file));
      const scheduled = /\bschedule\(/.test(source);
      const called = client.includes(`/api/${name}`);
      const external = name in CALLED_FROM_OUTSIDE;
      expect(scheduled || called || external, name).toBe(true);
    });
  }
});
