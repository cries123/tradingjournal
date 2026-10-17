import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessSyncHealth, syncHealthMessage, type ConnectedAccount } from '../../server/syncHealth';
import type { SyncOutcome } from '../utils/journalEvents';

const TODAY = '2026-10-17';

const row = (over: Partial<SyncOutcome> = {}): SyncOutcome => ({
  accountId: 'acct',
  institution: 'Charles Schwab',
  activityCount: 40,
  tradesReturned: 12,
  unmatchedCloses: 0,
  ignored: 0,
  ignoredByType: {},
  truncated: false,
  automatic: true,
  fresh: 3,
  ...over,
});

const user = (uid: string, ranOn: string | null, today: SyncOutcome[] = []): ConnectedAccount => ({
  uid,
  autoSyncRanOn: ranOn,
  today,
});

describe('assessSyncHealth', () => {
  it('is quiet on an ordinary morning', () => {
    const h = assessSyncHealth([user('a', TODAY, [row()]), user('b', TODAY, [row({ fresh: 0, activityCount: 8 })])], TODAY);
    expect(h.ok).toBe(true);
    expect(h.summary).toEqual({ connected: 2, ran: 2, accounts: 2, activities: 48, fresh: 3, truncated: 0, emptyFeeds: 0 });
  });

  it('says so when the job did not reach anyone', () => {
    // The run stepped over every user, or never fired: nobody is stamped with today.
    const h = assessSyncHealth([user('a', '2026-10-16'), user('b', null)], TODAY);
    expect(h.ok).toBe(false);
    expect(h.problems[0]).toMatch(/did not complete for anyone/);
    expect(h.problems[0]).toContain('2 connected accounts');
  });

  it('is not alarmed by nobody being connected', () => {
    expect(assessSyncHealth([], TODAY).ok).toBe(true);
  });

  it('treats every feed empty at once as our problem, not twenty quiet traders', () => {
    const h = assessSyncHealth(
      [user('a', TODAY, [row({ activityCount: 0, tradesReturned: 0, fresh: 0 })]), user('b', TODAY, [row({ activityCount: 0, tradesReturned: 0, fresh: 0 })])],
      TODAY,
    );
    expect(h.ok).toBe(false);
    expect(h.problems[0]).toMatch(/All 2 brokerage accounts returned no activity/);
  });

  it('lets one quiet account be a quiet trader', () => {
    const h = assessSyncHealth([user('a', TODAY, [row({ activityCount: 0, fresh: 0 })]), user('b', TODAY, [row()])], TODAY);
    expect(h.ok).toBe(true);
  });

  it('flags an account that hit the page cap, since its state stays incomplete', () => {
    const h = assessSyncHealth([user('a', TODAY, [row({ truncated: true })])], TODAY);
    expect(h.ok).toBe(false);
    expect(h.problems[0]).toMatch(/hit the page cap/);
  });

  it('flags a run that wrote no history at all', () => {
    const h = assessSyncHealth([user('a', TODAY, [])], TODAY);
    expect(h.ok).toBe(false);
    expect(h.problems[0]).toMatch(/wrote no sync history/);
  });

  it('only reads rows from users stamped today, so yesterday’s rows cannot vouch for this morning', () => {
    const h = assessSyncHealth([user('a', '2026-10-16', [row()])], TODAY);
    expect(h.summary.accounts).toBe(0);
    expect(h.ok).toBe(false);
  });
});

describe('syncHealthMessage', () => {
  it('leads with the problems and ends with the numbers', () => {
    const h = assessSyncHealth([user('a', null)], TODAY);
    const { subject, message } = syncHealthMessage(h, TODAY);
    expect(subject).toBe('Morning import needs a look — 1 problem');
    expect(message.indexOf('did not complete')).toBeLessThan(message.indexOf('Today (2026-10-17)'));
  });

  it('describes a fine morning in one line, for the log', () => {
    const h = assessSyncHealth([user('a', TODAY, [row({ fresh: 5 })])], TODAY);
    expect(syncHealthMessage(h, TODAY).subject).toBe('Morning import ran: 5 new trades');
  });
});

describe('the scheduled check', () => {
  const fn = readFileSync('netlify/functions/sync-health.ts', 'utf8');

  it('runs after the import it checks, on the same days', () => {
    expect(readFileSync('netlify/functions/auto-sync.ts', 'utf8')).toMatch(/schedule\('0 11 \* \* 2-6'/);
    expect(fn).toMatch(/schedule\('0 13 \* \* 2-6'/);
  });

  it('emails only when something is wrong', () => {
    expect(fn).toContain('if (health.ok || !isMailConfigured()) return');
  });
});
