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

describe('the automatic pull covers its window', () => {
  /*
   * pullRecentActivityForUser asked SnapTrade for one page of 1,000 activities and used whatever came
   * back: no offset, no read of the pagination metadata, no check for hitting the cap. An account past
   * 1,000 activities in the ten-day window was silently truncated, and nothing told the trader or the
   * log.
   *
   * The manual sync beside it in the same file has paged properly all along — offset, a break on a
   * short page, a truncated flag, and a sentence on screen saying the oldest history was left out — so
   * both the parameter and the metadata were available and simply unused.
   *
   * Reachable by the repo's own estimate, stated twice: "ten days of an active 0DTE account is
   * comfortably more than 500 round trips", and a round trip is at least two activities.
   */
  const source = codeOnly(readFileSync('server/brokerConnectHandler.ts', 'utf8'));
  const pull = source.slice(source.indexOf('export async function pullRecentActivityForUser'));

  it('asks for more than the first page', () => {
    expect(pull).toContain('offset: page * PAGE_SIZE');
    expect(pull).toMatch(/for \(let page = 0; page < MAX_PAGES/);
  });

  it('stops as soon as a page comes back short', () => {
    // Otherwise every pull costs the full page budget in round trips.
    expect(pull).toContain('if (batch.length < PAGE_SIZE) break;');
  });

  it('says so when it hits the cap instead of returning a quiet subset', () => {
    expect(pull).toContain('truncated = true');
    expect(pull).toMatch(/truncated,/);
  });

  it('is surfaced by the job that calls it', () => {
    /*
     * The warning has to be GUARDED by the flag, not merely present in the file. A first version of
     * this asserted that both strings appeared somewhere, and a mutation replacing `if (truncated)`
     * with `if (false)` sailed through it — the words were still there, the report was not.
     */
    const job = codeOnly(readFileSync('netlify/functions/auto-sync.ts', 'utf8'));

    expect(job).toMatch(/const \{[^}]*truncated[^}]*\} = await pullRecentActivityForUser/);
    expect(job).toMatch(/if \(truncated\) \{\s*console\.warn\(/);
  });
});

describe('a month of revenue that could not be read', () => {
  /*
   * readMonthRevenue was wrapped in `.catch(() => ({ revenue: 0, charges: 0 }))` inside the per-month
   * try. A completed month is cached permanently — no TTL, and nothing ever re-reads it — so one
   * transient Firestore error or a missing index froze that month's revenue at $0 for good, on every
   * later load of the panel.
   *
   * Letting it throw hands the month to the catch below, which already logs, sets the warning banner,
   * and skips both the table row and the cache write.
   */
  const source = codeOnly(readFileSync('server/costsHandler.ts', 'utf8'));

  it('is not swallowed into a zero', () => {
    expect(source).not.toMatch(/readMonthRevenue\(month\)\.catch/);
    expect(source).toContain('await readMonthRevenue(month);');
  });

  it('still has the catch that warns and skips the cache', () => {
    // The fix is a deletion, so this is the half that has to survive it.
    expect(source).toMatch(/warning = `Some months could not be read/);
    expect(source).toMatch(/if \(!partial\) \{\s*await cacheRef\.set/);
  });
});

describe('which journal a number covers', () => {
  /*
   * Every figure in the app is scoped to the active journal — useTrades filters combinedTrades by
   * settings.activeAccountId. Two surfaces were not, and journals are a sold feature at every tier,
   * suggested on the pricing page for exactly the split that breaks them: "a live account and a paper
   * one, or one per strategy".
   */
  it('has the weekly recap reading the active journal', () => {
    /*
     * It summed EVERY journal into the net, the best day, the worst day and the per-setup rollup, so
     * the emailed week matched no screen in the product and a paper account's results were mailed to
     * the trader as their own.
     */
    const job = codeOnly(readFileSync('netlify/functions/weekly-recap.ts', 'utf8'));

    expect(job).toMatch(/resolveTradeAccountId\(trade\.accountId\) === activeAccountId/);
    expect(job).toMatch(/recentTrades\(uid, await activeJournalFor\(uid\)\)/);
  });

  it('filters in memory, so no composite index is needed', () => {
    // The query still rides the automatic single-field index on date. Adding accountId to the where
    // clause would need an index somebody has to remember to create in the console.
    const job = codeOnly(readFileSync('netlify/functions/weekly-recap.ts', 'utf8'));
    expect(job).not.toMatch(/where\('accountId'/);
  });

  it('has the rule banner reading the same journal as the breach list', () => {
    /*
     * The banner was given everyTrade — the union of every journal, documented as being for full
     * backups — while the breach list beside it reads the filtered view. Two live trades and two
     * paper ones under a cap of four produced "that is trade 4 of 4, the next one breaks your own
     * limit" above a list reporting no breaches at all.
     */
    const page = codeOnly(readFileSync('src/pages/JournalApp.tsx', 'utf8'));
    expect(page).toContain('<RuleStandingBanner trades={allTrades} />');
    expect(page).not.toContain('<RuleStandingBanner trades={everyTrade} />');
  });

  it('names the journal in the year-end tax file', () => {
    // The export covers one journal and the artifact said so nowhere — not the header, not the
    // filename — so neither the trader nor their accountant could tell it was a slice.
    const report = codeOnly(readFileSync('src/utils/taxReport.ts', 'utf8'));
    const exporter = codeOnly(readFileSync('src/utils/exportTrades.ts', 'utf8'));

    expect(report).toMatch(/if \(journalName\) lines\.push\(`Journal,/);
    expect(exporter).toMatch(/exportTaxYearCsv\([^)]*journalName/);
  });
});

describe('a paused subscription', () => {
  /*
   * A pause maps to 'canceled' so that access eventually stops, which is right — but it then reached
   * the billing email, whose subject and body both say "you will not be billed again". Creem lifts a
   * pause automatically, so that is a written promise the product breaks by design.
   */
  it('is not told it will never be billed again', () => {
    const webhook = codeOnly(readFileSync('netlify/functions/creem-webhook.ts', 'utf8'));
    expect(webhook).toMatch(/includes\('paused'\)\) return;/);
    expect(webhook).toContain('tellThem(parsed, payload.eventType)');
  });

  it('is not cancelled by being resumed', () => {
    /*
     * "unpaused" contains "paused" — the same trap the unpaid/paid guard in the ledger exists for.
     * Checked first, so lifting a pause restores the plan instead of taking it away from somebody who
     * had just restarted it.
     */
    const client = codeOnly(readFileSync('server/creemClient.ts', 'utf8'));
    const statusBlock = client.slice(client.indexOf("const status: ParsedBillingEvent['status']"));

    const unpausedAt = statusBlock.indexOf("includes('unpaused')");
    const pausedAt = statusBlock.indexOf("includes('paused')");
    expect(unpausedAt).toBeGreaterThan(-1);
    expect(unpausedAt).toBeLessThan(pausedAt);
  });
});

describe('the SPY comparison', () => {
  /*
   * Month to date was baselined on the first close INSIDE the month, so that session's own move was
   * excluded. On the first trading day it was worse: Yahoo's in-progress bar closes at the live
   * price, so start and end were the same number and the chip read +0.0% all day. With no bar yet at
   * all, the fallback took the second-to-last close, labelling the previous month's last single-day
   * move as this month's return.
   */
  const source = codeOnly(readFileSync('server/benchmarkHandler.ts', 'utf8'));

  it('baselines on the last close before the month', () => {
    expect(source).toContain('valid[firstOfMonth - 1].c');
  });

  it('no longer reaches back into the previous month for a fallback', () => {
    expect(source).not.toContain('valid[valid.length - 2].c');
  });
});
