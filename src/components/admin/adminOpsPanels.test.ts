import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JobRunsPanel } from './JobRunsPanel';
import { SyncFeedPanel } from './SyncFeedPanel';
import { BillingEventsPanel } from './BillingEventsPanel';
import { EmailLogPanel } from './EmailLogPanel';
import { AdminTabBar } from './AdminTabBar';
import { JOBS, type JobRun } from '../../utils/jobSchedule';
import { matchesPlanFilter } from '../../utils/adminUserFilters';
import { formatDuration, relativeTime } from '../../utils/relativeTime';

/*
 * The Ops tab's four panels, the plan chips and the clock words. First paint only.
 */

const paint = (el: Parameters<typeof renderToString>[0]) =>
  renderToString(el).replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const NOW = Date.parse('2026-10-19T16:00:00Z');
const label = (uid: string) => (uid === 'u1' ? '@jay' : uid);

describe('the scheduled jobs panel', () => {
  const run = (job: JobRun['job'], over: Partial<JobRun> = {}): JobRun => ({
    job, startedAt: '2026-10-19T11:00:00Z', finishedAt: '2026-10-19T11:00:08Z', durationMs: 8200, ok: true, summary: { ran: 12, imported: 340, failed: 0 }, error: null, ...over,
  });

  it('names every job and says ran, late, failed or never for each', () => {
    const jobs = JOBS.map((spec) => ({
      spec,
      last:
        spec.name === 'auto-sync' ? run('auto-sync')
        : spec.name === 'weekly-recap' ? run('weekly-recap', { finishedAt: '2026-10-01T14:00:00Z' })
        : spec.name === 'trial-nudges' ? run('trial-nudges', { ok: false, error: 'HTTP 500: boom', summary: null })
        : null,
    }));
    const words = text(paint(createElement(JobRunsPanel, { jobs, now: NOW })));
    for (const spec of JOBS) expect(words).toContain(spec.label);
    expect(words).toContain('Ran 5 h ago · 8.2 s');
    expect(words).toContain('ran 12');
    expect(words).toContain('imported 340');
    expect(words).toContain('Late');
    expect(words).toContain('Failed');
    expect(words).toContain('HTTP 500: boom');
    expect(words).toContain('No run recorded yet');
    expect(words).toContain('2 need a look');
  });
});

describe('the sync feed panel', () => {
  const sync = (over: Partial<Parameters<typeof SyncFeedPanel>[0]['rows'][0]['sync']> = {}) => ({
    accountId: 'a', institution: 'Robinhood', activityCount: 100, tradesReturned: 40, unmatchedCloses: 0, ignored: 0, ignoredByType: {}, truncated: false, ...over,
  });

  it('sums the last day and marks the rows that imported nothing or never landed', () => {
    const rows = [
      { id: '1', uid: 'u1', at: '2026-10-19T15:00:00Z', sync: sync({ fresh: 40, landed: true }), eventId: 'e1' },
      { id: '2', uid: 'u2', at: '2026-10-19T14:00:00Z', sync: sync({ activityCount: 0, tradesReturned: 0 }), eventId: 'e2' },
      { id: '3', uid: 'u3', at: '2026-10-19T13:00:00Z', sync: sync({ landed: false }), eventId: 'e3' },
      { id: '4', uid: 'u1', at: '2026-10-10T13:00:00Z', sync: sync({ fresh: 9 }), eventId: 'e4' },
    ];
    const html = paint(createElement(SyncFeedPanel, { rows, now: NOW, labelFor: label }));
    const words = text(html);
    expect(words).toContain('Last 24 hours: 3 syncs, 80 trades in');
    expect(words).toContain('1 with nothing to import');
    expect(words).toContain('1 never reached a journal');
    expect(words).toContain('@jay');
    expect(html).toContain('border-red-500/30');
    expect(html).toContain('border-amber-500/25');
  });
});

describe('the billing events panel', () => {
  it('shows each outcome, and a replay button only where the payload was kept', () => {
    const base = { receivedAt: '2026-10-19T15:30:00Z', uid: 'u1', tier: 'gold', status: 'active', trialing: false, reason: null, replays: 0, lastReplayAt: null };
    const events = [
      { ...base, id: 'a', eventType: 'subscription.paid', outcome: 'applied' as const, payload: 'stored' },
      { ...base, id: 'b', eventType: 'subscription.paid', outcome: 'failed' as const, reason: 'Storage unavailable', payload: 'stored', replays: 2 },
      { ...base, id: 'c', eventType: 'checkout.completed', outcome: 'ignored' as const, payload: null },
    ];
    const html = paint(createElement(BillingEventsPanel, { events, now: NOW, labelFor: label, onReplay: async () => 'ok' }));
    const words = text(html);
    expect(words).toContain('Applied');
    expect(words).toContain('Failed');
    expect(words).toContain('Storage unavailable');
    expect(words).toContain('replayed ×2');
    expect(words).toContain('Ignored');
    // Two events kept their payload; the ignored one did not, so it has no button.
    expect(html.split('Replay</button>').length - 1).toBe(2);
  });
});

describe('the email log panel', () => {
  it('names the account behind an address, and says why a send did not go out', () => {
    const emails = [
      { id: 'e1', to: 'jay@x.com', subject: 'Your syncs are back', tag: 'support-message', at: '2026-10-19T15:00:00Z', sent: true, reason: null, providerId: 'p' },
      { id: 'e2', to: 'stranger@x.com', subject: 'Weekly recap', tag: 'weekly-recap', at: '2026-10-19T14:00:00Z', sent: false, reason: 'provider-error', providerId: null },
    ];
    const words = text(paint(createElement(EmailLogPanel, {
      emails, now: NOW, mailConfigured: false,
      uidFor: (e) => (e === 'jay@x.com' ? 'u1' : null), labelFor: label,
    })));
    expect(words).toContain('@jay');
    expect(words).toContain('stranger@x.com');
    expect(words).toContain('Not sent · provider-error');
    expect(words).toContain('No mail provider configured');
  });
});

describe('the admin nav', () => {
  it('has the Ops tab in both layouts', () => {
    for (const variant of ['grid', 'rail'] as const) {
      const html = paint(createElement(AdminTabBar, { tab: 'ops', onChange: () => undefined, openCount: 0, userCount: 1, ticketsWaiting: 0, openErrors: 0, variant }));
      expect(html).toContain('Ops');
      expect(html).toMatch(/aria-current="page"/);
    }
  });
});

describe('the plan chips', () => {
  const gold = { tier: 'gold' as const, source: 'purchase' as const, status: 'active' as const };
  const lapsed = { tier: 'gold' as const, source: 'purchase' as const, status: 'past_due' as const };
  const trial = { ...gold, trialEndsAt: '2026-10-25T00:00:00Z' };

  it('filters by what the account actually has, not by what the record says', () => {
    expect(matchesPlanFilter('gold', { tradeCount: 5 }, gold, NOW)).toBe(true);
    expect(matchesPlanFilter('gold', { tradeCount: 5 }, lapsed, NOW)).toBe(false);
    expect(matchesPlanFilter('free', { tradeCount: 5 }, lapsed, NOW)).toBe(true);
    expect(matchesPlanFilter('free', { tradeCount: 0 }, null, NOW)).toBe(true);
    expect(matchesPlanFilter('trial', { tradeCount: 0 }, trial, NOW)).toBe(true);
    expect(matchesPlanFilter('trial', { tradeCount: 0 }, { ...gold, trialEndsAt: '2026-10-01T00:00:00Z' }, NOW)).toBe(false);
    expect(matchesPlanFilter('paying-idle', { tradeCount: 0 }, gold, NOW)).toBe(true);
    expect(matchesPlanFilter('paying-idle', { tradeCount: 1 }, gold, NOW)).toBe(false);
    expect(matchesPlanFilter('paying-idle', { tradeCount: 0 }, null, NOW)).toBe(false);
    expect(matchesPlanFilter('all', { tradeCount: 0 }, null, NOW)).toBe(true);
  });
});

describe('the clock words', () => {
  it('says how long ago, and the date once it is more than a week', () => {
    expect(relativeTime(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW - 4 * 60_000).toISOString(), NOW)).toBe('4 min ago');
    expect(relativeTime(new Date(NOW - 5 * 3_600_000).toISOString(), NOW)).toBe('5 h ago');
    expect(relativeTime(new Date(NOW - 3 * 86_400_000).toISOString(), NOW)).toBe('3 d ago');
    expect(relativeTime(new Date(NOW - 20 * 86_400_000).toISOString(), NOW)).toMatch(/Sep 29|Sept 29/);
    expect(formatDuration(840)).toBe('840 ms');
    expect(formatDuration(8200)).toBe('8.2 s');
    expect(formatDuration(130_000)).toBe('2 min');
  });
});
