import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRoutePath } from '../hooks/useRoute';

/*
 * The broker-request form is gone, and so is every way to write what it wrote.
 *
 * It took submissions from anyone, signed in or not, and was being spammed. Taking the form off the
 * site does not close the hole by itself: the collection behind it accepted creates from
 * unauthenticated clients, so a bot posting straight to Firestore would carry on regardless. These
 * fail if either half comes back.
 */

const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('broker requests', () => {
  it('have no rule letting anyone write them', () => {
    const rules = codeOnly(readFileSync('firestore.rules', 'utf8'));
    // No match block at all means Firestore's default: every read and write denied.
    expect(rules).not.toMatch(/match \/brokerSupportRequests/);
    expect(rules).not.toContain('validBrokerSupportCreate');
  });

  it('are not written or read anywhere in the app', () => {
    const offenders = [...sourceFiles('src'), ...sourceFiles('server')].filter((f) =>
      codeOnly(readFileSync(f, 'utf8')).includes('brokerSupportRequests'),
    );
    expect(offenders).toEqual([]);
  });

  it('send an old link to the broker list rather than to nothing', () => {
    expect(parseRoutePath('/request-broker').route).toBe('brokers');
    expect(readFileSync('netlify.toml', 'utf8')).toMatch(/from = "\/request-broker"\s+to = "\/brokers"\s+status = 301/);
  });
});
