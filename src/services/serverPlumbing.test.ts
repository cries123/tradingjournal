import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Three pieces of server plumbing that were each wrong in a way nothing could have noticed.
 *
 * All three are in Netlify handlers or in code only they call, so vitest cannot drive them — these
 * assert against the source, which is the same idiom billingPromise.test.ts uses. For two of them the
 * failure is silence, and for the third it is an email to a stranger, so a test that merely checks
 * "it compiles" would be worth nothing.
 */

const FUNCTIONS_DIR = 'netlify/functions';

const functionFiles = (): string[] =>
  readdirSync(FUNCTIONS_DIR)
    .filter((f) => /\.m?ts$/.test(f))
    .map((f) => join(FUNCTIONS_DIR, f));

/**
 * Code with the comments taken out.
 *
 * Needed because these fixes are documented by comments that QUOTE the line they removed, so a
 * source assertion matching the raw text finds the explanation and calls it a regression. That
 * happened twice while writing these tests — once here, once with a vendor name in the privacy
 * policy's prose — so the lesson is cheap to apply and expensive to skip.
 */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('who a support-reply notification is sent to', () => {
  /*
   * `email` on a support ticket is written by the client at create time, and validTicketCreate in
   * firestore.rules never checks it — it is not required to exist, let alone to match the person
   * opening the ticket. It was passed straight to sendEmail's `to`.
   *
   * So anybody could open a ticket naming somebody else's address, and the next routine support reply
   * (the admin panel POSTs this endpoint automatically on every reply) would send mail from the
   * verified sending domain to that address, with a subject and quoted body the same person chose —
   * `subject` on create, `lastMessagePreview` through the owner-writable update rule. It leaked a
   * private support reply to a third party and made the domain a sending service for a stranger.
   */
  const source = codeOnly(readFileSync('netlify/functions/ticket-notify.ts', 'utf8'));

  it('comes from the account, not from the ticket document', () => {
    expect(source).toMatch(/getAdminAuth\(\)\s*\n?\s*\.getUser\(ticket\.uid\)/);
    expect(source).toContain('to,');
  });

  it('never passes the client-written address to the mailer', () => {
    expect(source).not.toMatch(/to:\s*ticket\.email/);
  });

  it('sends nothing when the account has no address', () => {
    // Bails rather than falling back to the document's value, which is the whole point.
    expect(source).toMatch(/if \(!to\) \{/);
  });
});

describe('server-side error reports', () => {
  /*
   * logServerError was fire-and-forget "for handlers that must not wait on a diagnostic", and every
   * caller is the line immediately before `return { statusCode: 500 }`. A Netlify function is a
   * Lambda: the environment freezes when the handler's promise resolves, so the Firestore transaction
   * inside was abandoned and the report never landed — worst in the daily and weekly jobs, whose own
   * comments assert the row exists, because their container is then reaped rather than thawed.
   */
  it('returns a promise rather than voiding one', () => {
    const source = codeOnly(readFileSync('server/errorReports.ts', 'utf8'));
    expect(source).toContain('): Promise<void> {');
    expect(source).not.toMatch(/void recordServerError/);
  });

  it('is awaited at every call site', () => {
    const offenders: string[] = [];
    const files = [...functionFiles(), ...readdirSync('server').filter((f) => f.endsWith('.ts')).map((f) => join('server', f))];

    for (const file of files) {
      if (file.endsWith('errorReports.ts')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('logServerError(')) return;
        // An import of the symbol is not a call of it.
        if (/^\s*import|from '/.test(line)) return;
        if (!/await logServerError\(|return logServerError\(/.test(line)) {
          offenders.push(`${file.split(/[\\/]/).join('/')}:${i + 1} ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('finds the call sites it is checking', () => {
    // The guard on the guard: if the matcher stopped matching, the test above would pass by finding
    // nothing while un-awaited calls piled back up.
    let calls = 0;
    const files = [...functionFiles(), ...readdirSync('server').filter((f) => f.endsWith('.ts')).map((f) => join('server', f))];
    for (const file of files) {
      if (file.endsWith('errorReports.ts')) continue;
      calls += (readFileSync(file, 'utf8').match(/await logServerError\(/g) ?? []).length;
    }
    expect(calls).toBeGreaterThan(8);
  });
});

describe('the broker connection mirror', () => {
  /*
   * handleStatus wrote connected:false before asking SnapTrade anything. Redundant on the happy path
   * — the write after the answer covers an empty account list too — and destructive otherwise:
   * withCredentialRecovery rethrows anything that is not a refused credential, so a 5xx, a timeout or
   * a rate limit left the mirror asserting the account has no broker.
   *
   * connected == true is what gates the reaper, Diamond's morning import, the rule alerts, the cost
   * run-rate and the trial nudge's "you have not connected a brokerage yet". A paying subscriber lost
   * all of it the next time SnapTrade had a bad minute, with nothing in any log naming them.
   */
  const source = codeOnly(readFileSync('server/brokerConnectHandler.ts', 'utf8'));
  const handleStatus = source.slice(
    source.indexOf('async function handleStatus'),
    source.indexOf('async function handleStatus') + 2200,
  );

  it('is not blanked before SnapTrade has answered', () => {
    const beforeTheCall = handleStatus.slice(0, handleStatus.indexOf('listUserAccounts'));
    expect(beforeTheCall).not.toMatch(/recordBrokerConnectionState\(uid, \[\], 0\)/);
  });

  it('is still written from the answer', () => {
    // The fix is a deletion, so this is the half that must survive it.
    expect(handleStatus).toMatch(/recordBrokerConnectionState\(\s*\n?\s*uid,/);
    expect(handleStatus).toContain('accounts.length');
  });
});
