import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TICKET_CATEGORIES } from '../../services/supportTickets';

/*
 * Where a bug report actually goes, and what the admin panel says about it.
 *
 * Two routes, one name. A signed-in trader who reports a bug gets a support TICKET with the 'bug'
 * category — ReportBugContent hands them to SupportTicketsContent, deliberately, because a bug
 * report is usually the start of a conversation. Only a signed-out visitor still writes to the
 * `bugReports` collection.
 *
 * The admin panel listed that collection under the heading "Bug reports" and said "No bug reports
 * yet" when it was empty — which, since the ticket route shipped, is every report a signed-in user
 * has ever filed. The reports were in Support the whole time.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

const ADMIN = read('src/pages/AdminPage.tsx');
const REPORT_BUG = read('src/components/support/ReportBugContent.tsx');

describe('the two routes a bug report can take', () => {
  it('sends a signed-in reporter to a ticket, not to the bugReports collection', () => {
    expect(REPORT_BUG).toMatch(/if \(signedInUser && backendReady\)/);
    expect(REPORT_BUG).toContain("initialCategory=\"bug\"");
  });

  it('keeps the plain form for somebody with no account to reply to', () => {
    expect(REPORT_BUG).toContain('submitBugReport(');
    expect(REPORT_BUG).toContain('AnonymousBugReportForm');
  });

  it('has a bug category on tickets for the first route to use', () => {
    // If this id is ever renamed, the admin count below silently drops to zero and the panel goes
    // back to saying nothing is there.
    expect(TICKET_CATEGORIES.map((c) => c.id)).toContain('bug');
  });
});

describe('what the admin panel says about them', () => {
  it('names the list for what it holds rather than for all bug reports', () => {
    expect(ADMIN).toContain('Bug reports from signed-out visitors');
  });

  it('counts the ones that became tickets, and points at them', () => {
    expect(ADMIN).toContain("t.category === 'bug' && t.status === 'open'");
    expect(ADMIN).toContain('open bug ticket');
    expect(ADMIN).toContain('in Support');
    // And it goes somewhere: a count with no way to reach the queue is the same dead end.
    expect(ADMIN).toMatch(/onClick=\{\(\) => setTab\('support'\)\}/);
  });

  it('no longer claims there are none when the empty list is only half the story', () => {
    /*
     * "No bug reports yet." was the sentence that made this look like a data bug rather than two
     * collections with one name.
     */
    expect(ADMIN).not.toContain('No bug reports yet.');
  });
});
