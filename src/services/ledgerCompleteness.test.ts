import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Two admin numbers that are about all of history have to be computed from all of history.
 *
 * Trial conversion ("has this account ever paid") and month-on-month movement ("paid last month, not
 * this one") were computed in the browser from the cost report's `purchases` — the newest FIFTY
 * charges, a list capped for the screen. Past fifty, a conversion from months ago read as a trial
 * that ended without paying, and the oldest month in view counted every returning customer as new.
 *
 * Source assertions because the cost handler reads Firestore through the Admin SDK and the page is a
 * component vitest does not render; the arithmetic itself is tested in adminRisk.test.ts.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');
const codeOnly = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const HANDLER = read('server/costsHandler.ts');
const PAGE = codeOnly('src/pages/AdminPage.tsx');

describe('the payment ledger behind the trial and movement numbers', () => {
  it('reads the whole ledger, not a page of it', () => {
    const fn = HANDLER.slice(
      HANDLER.indexOf('async function readChargeLedger'),
      HANDLER.indexOf('export async function buildCostReport'),
    );
    expect(fn).toContain(".collection('billingCharges')");
    expect(fn).not.toContain('.limit(');
  });

  it('computes both numbers from that ledger on the server', () => {
    expect(HANDLER).toContain('everPaid: ledger ?');
    expect(HANDLER).toContain('movement: ledger ? mrrMovement(months, ledger)');
  });

  it('reports a ledger it could not read as unknown, not as empty', () => {
    // An empty list would say "nobody has ever paid" and turn every finished trial into a lapse.
    expect(HANDLER).toContain('readChargeLedger().catch(() => null)');
  });

  it('has the page reading the server numbers and not the capped display list', () => {
    expect(PAGE).toContain('ready?.costs?.everPaid');
    expect(PAGE).toContain('ready?.costs?.movement');
    expect(PAGE).not.toMatch(/costs\?*\.purchases/);
  });
});

describe('the shared movement function', () => {
  it('imports nothing, so the server can run it without browser code in its typecheck', () => {
    // It lived in adminRisk.ts first, whose type imports reach src/services — and through them
    // `window` and the Firestore client — which the server tsconfig cannot type.
    expect(read('src/utils/mrrMovement.ts')).not.toMatch(/^import /m);
  });
});
