import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GRACE_DAYS,
  MAX_REAPS_PER_RUN,
  decideReap,
  lapsedAtFor,
  runReap,
} from '../../server/brokerReaper';
import type { Entitlement } from '../../server/entitlements';
import {
  brokerLinkEndingEmail,
  brokerLinkRemovedEmail,
  friendlyDate,
} from '../../server/emailTemplates';

/*
 * Taking a broker link back is the most destructive thing this codebase does on a timer, and the
 * only witness is a log line nobody reads. So the boundaries are pinned here: who is spared, when
 * the clock starts, and what happens to somebody who pays during the grace period.
 */

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

const entitlement = (patch: Partial<Entitlement>): Entitlement => ({
  tier: 'free',
  source: 'purchase',
  status: 'active',
  updatedAt: at(-40),
  ...patch,
});

const comp = (tier: 'silver' | 'gold' | 'diamond', untilDays: number) => ({
  tier,
  until: at(untilDays),
  grantedBy: 'admin-1',
  grantedAt: at(-30),
});

describe('who keeps their link', () => {
  it('spares a paying subscriber', () => {
    const e = entitlement({ tier: 'silver', status: 'active' });
    expect(decideReap({ entitlement: e, now: NOW })).toEqual({ action: 'keep', clearMark: false });
  });

  it('spares a cancelled subscriber who is still inside the period they paid for', () => {
    const e = entitlement({ tier: 'gold', status: 'canceled', currentPeriodEnd: at(11) });
    expect(decideReap({ entitlement: e, now: NOW }).action).toBe('keep');
  });

  it('spares a hand-granted account, which has no subscription to read', () => {
    const e = entitlement({ tier: 'diamond', source: 'admin', status: 'active' });
    expect(decideReap({ entitlement: e, now: NOW }).action).toBe('keep');
  });

  it('spares someone on a running trial', () => {
    const e = entitlement({ tier: 'free', comp: comp('silver', 4) });
    expect(decideReap({ entitlement: e, now: NOW }).action).toBe('keep');
  });

  it('stops a half-run clock when someone subscribes during grace', () => {
    // Otherwise the stamp survives, and their NEXT lapse gets a grace period already part spent.
    const e = entitlement({ tier: 'silver', status: 'active' });
    expect(decideReap({ entitlement: e, unentitledSince: at(-2), now: NOW })).toEqual({
      action: 'keep',
      clearMark: true,
    });
  });
});

describe('the grace period', () => {
  const lapsed = entitlement({ tier: 'free', comp: comp('silver', -1) });

  it('waits while the account is inside it', () => {
    const decision = decideReap({ entitlement: lapsed, now: NOW });
    expect(decision.action).toBe('wait');
    if (decision.action !== 'wait') throw new Error('expected wait');
    expect(decision.lapsedAt).toBe(at(-1));
    expect(decision.reapAfter).toBe(at(DEFAULT_GRACE_DAYS - 1));
  });

  it('holds right up to the boundary, and reaps once past it', () => {
    const trial = entitlement({ tier: 'free', comp: comp('silver', -DEFAULT_GRACE_DAYS) });
    // Exactly on the boundary the clock has run out — the comparison is `now < reapAt`.
    expect(decideReap({ entitlement: trial, now: NOW }).action).toBe('reap');
    expect(decideReap({ entitlement: trial, now: NOW - 1 }).action).toBe('wait');
  });

  it('is measured from when access actually ended, not from when a run first noticed', () => {
    // A daily job first sees this today, but the trial ended six days ago. Restarting the clock
    // here would hand every lapsed account an extra grace period for free.
    const trial = entitlement({ tier: 'free', comp: comp('gold', -6) });
    expect(decideReap({ entitlement: trial, unentitledSince: at(0), now: NOW }).action).toBe('reap');
  });

  it('takes the later of a cancelled period and an expired trial', () => {
    const both = entitlement({
      tier: 'silver',
      status: 'canceled',
      currentPeriodEnd: at(-9),
      comp: comp('silver', -2),
    });
    expect(lapsedAtFor({ entitlement: both, now: NOW })).toBe(at(-2));
  });

  it('ignores a period end that has not arrived yet', () => {
    const e = entitlement({ tier: 'free', currentPeriodEnd: at(30) });
    expect(lapsedAtFor({ entitlement: e, now: NOW })).toBe(new Date(NOW).toISOString());
  });

  it('starts the clock now for a record with no dates at all, rather than reaping on sight', () => {
    expect(decideReap({ entitlement: null, now: NOW }).action).toBe('wait');
    const free = entitlement({ tier: 'free' });
    expect(decideReap({ entitlement: free, now: NOW }).action).toBe('wait');
  });

  it('reaps a past-due account once its grace has run, and says why', () => {
    const e = entitlement({ tier: 'gold', status: 'past_due' });
    const decision = decideReap({ entitlement: e, unentitledSince: at(-8), now: NOW });
    expect(decision.action).toBe('reap');
    if (decision.action !== 'reap') throw new Error('expected reap');
    expect(decision.reason).toBe('payment failed');
  });
});

describe('a run', () => {
  const deps = (rows: { uid: string; unentitledSince?: string | null; warnedAt?: string | null }[], plans: Record<string, Entitlement | null>) => {
    const removeLink = vi.fn(async () => undefined);
    const markUnentitledSince = vi.fn(async () => undefined);
    const markWarned = vi.fn(async () => undefined);
    const warn = vi.fn(async () => true);
    const notifyRemoved = vi.fn(async () => undefined);
    return {
      removeLink,
      markUnentitledSince,
      markWarned,
      warn,
      notifyRemoved,
      base: {
        listConnected: async () => rows,
        readEntitlement: async (uid: string) => plans[uid] ?? null,
        removeLink,
        markUnentitledSince,
        markWarned,
        warn,
        notifyRemoved,
        now: NOW,
      },
    };
  };

  const lapsedLongAgo = () => entitlement({ tier: 'free', comp: comp('silver', -30) });

  it('removes the link and tells them, once they have been warned', async () => {
    const { base, removeLink, markUnentitledSince, markWarned, notifyRemoved } = deps(
      [{ uid: 'u1', unentitledSince: at(-30), warnedAt: at(-6) }],
      { u1: lapsedLongAgo() },
    );
    const summary = await runReap(base);

    expect(summary).toMatchObject({ considered: 1, reaped: 1, waiting: 0, kept: 0, failed: 0 });
    expect(summary.details[0]).toMatchObject({ uid: 'u1', reason: 'complimentary access ended' });
    expect(removeLink).toHaveBeenCalledWith('u1');
    expect(notifyRemoved).toHaveBeenCalledWith('u1');
    expect(markUnentitledSince).toHaveBeenCalledWith('u1', null);
    expect(markWarned).toHaveBeenCalledWith('u1', null);
  });

  it('never removes a link from an account that has not been told', async () => {
    // The backlog case: everything that lapsed before any of this existed is already past its
    // grace period on the very first run. Reaping on the decision alone would take them all in
    // one morning, unannounced.
    const { base, removeLink, warn, markWarned } = deps([{ uid: 'u1', unentitledSince: at(-30) }], {
      u1: lapsedLongAgo(),
    });
    const summary = await runReap(base);

    expect(summary).toMatchObject({ reaped: 0, waiting: 1, warned: 1 });
    expect(removeLink).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('u1', expect.any(String));
    expect(markWarned).toHaveBeenCalledWith('u1', new Date(NOW).toISOString());
  });

  it('names the date the link goes when it warns', async () => {
    const { base, warn } = deps([{ uid: 'u1' }], {
      u1: entitlement({ tier: 'free', comp: comp('silver', -1) }),
    });
    await runReap(base);
    // Lapsed yesterday, five days of grace: four days from now.
    expect(warn).toHaveBeenCalledWith('u1', at(DEFAULT_GRACE_DAYS - 1));
  });

  it('waits without warning twice while the grace period runs', async () => {
    const { base, warn, markUnentitledSince, removeLink } = deps(
      [{ uid: 'u1', unentitledSince: at(-1), warnedAt: at(-1) }],
      { u1: entitlement({ tier: 'free', comp: comp('silver', -1) }) },
    );
    const summary = await runReap(base);

    expect(summary).toMatchObject({ waiting: 1, warned: 0, reaped: 0 });
    expect(warn).not.toHaveBeenCalled();
    expect(markUnentitledSince).not.toHaveBeenCalled();
    expect(removeLink).not.toHaveBeenCalled();
  });

  it('leaves the link alone for another day when the warning could not be sent', async () => {
    const { base, warn, removeLink, markWarned } = deps([{ uid: 'u1', unentitledSince: at(-30) }], {
      u1: lapsedLongAgo(),
    });
    warn.mockResolvedValueOnce(false);

    const summary = await runReap(base);
    expect(summary).toMatchObject({ reaped: 0, waiting: 1, warned: 0 });
    expect(warn).toHaveBeenCalled();
    expect(markWarned).not.toHaveBeenCalled();
    expect(removeLink).not.toHaveBeenCalled();
  });

  it('stamps a newly lapsed account once, and never pushes the clock forward on a rerun', async () => {
    const first = deps([{ uid: 'u1' }], { u1: entitlement({ tier: 'free', comp: comp('silver', -1) }) });
    await runReap(first.base);
    expect(first.markUnentitledSince).toHaveBeenCalledWith('u1', at(-1));

    const second = deps([{ uid: 'u1', unentitledSince: at(-1), warnedAt: at(-1) }], {
      u1: entitlement({ tier: 'free', comp: comp('silver', -1) }),
    });
    const summary = await runReap({ ...second.base, now: NOW + DAY });
    expect(summary.waiting).toBe(1);
    expect(second.markUnentitledSince).not.toHaveBeenCalled();
    expect(second.removeLink).not.toHaveBeenCalled();
  });

  it('stops both clocks when someone subscribes during grace', async () => {
    const { base, markUnentitledSince, markWarned } = deps(
      [{ uid: 'u1', unentitledSince: at(-2), warnedAt: at(-2) }],
      { u1: entitlement({ tier: 'silver', status: 'active' }) },
    );
    const summary = await runReap(base);

    expect(summary.kept).toBe(1);
    expect(markUnentitledSince).toHaveBeenCalledWith('u1', null);
    // Otherwise their next lapse inherits a warning they were sent months ago and skips straight
    // to removal with no notice at all.
    expect(markWarned).toHaveBeenCalledWith('u1', null);
  });

  it('carries on past an account that throws', async () => {
    const { base, removeLink } = deps(
      [
        { uid: 'bad', unentitledSince: at(-30), warnedAt: at(-6) },
        { uid: 'good', unentitledSince: at(-30), warnedAt: at(-6) },
      ],
      { bad: lapsedLongAgo(), good: lapsedLongAgo() },
    );
    removeLink.mockImplementationOnce(async () => {
      throw new Error('SnapTrade is down');
    });

    const summary = await runReap(base);
    expect(summary).toMatchObject({ considered: 2, reaped: 1, failed: 1 });
    expect(removeLink).toHaveBeenCalledWith('good');
  });

  it('removes the link even if the removal notice bounces', async () => {
    const { base, notifyRemoved, removeLink } = deps(
      [{ uid: 'u1', unentitledSince: at(-30), warnedAt: at(-6) }],
      { u1: lapsedLongAgo() },
    );
    notifyRemoved.mockRejectedValueOnce(new Error('mailbox full'));

    const summary = await runReap(base);
    expect(summary).toMatchObject({ reaped: 1, failed: 0 });
    expect(removeLink).toHaveBeenCalledWith('u1');
  });

  it('stops at the per-run ceiling', async () => {
    const rows = Array.from({ length: MAX_REAPS_PER_RUN + 10 }, (_, i) => ({
      uid: `u${i}`,
      unentitledSince: at(-30),
      warnedAt: at(-6),
    }));
    const plans = Object.fromEntries(rows.map((r) => [r.uid, lapsedLongAgo()]));
    const { base, removeLink } = deps(rows, plans);

    const summary = await runReap(base);
    expect(summary.reaped).toBe(MAX_REAPS_PER_RUN);
    expect(removeLink).toHaveBeenCalledTimes(MAX_REAPS_PER_RUN);
  });

  it('decides everything and changes nothing on a dry run', async () => {
    const { base, removeLink, markUnentitledSince, markWarned, warn, notifyRemoved } = deps(
      [
        { uid: 'u1', unentitledSince: at(-30), warnedAt: at(-6) },
        { uid: 'u2' },
      ],
      { u1: lapsedLongAgo(), u2: entitlement({ tier: 'free', comp: comp('silver', -1) }) },
    );
    const summary = await runReap({ ...base, dryRun: true });

    expect(summary).toMatchObject({ reaped: 1, waiting: 1, warned: 1, dryRun: true });
    expect(summary.details[0].uid).toBe('u1');
    for (const spy of [removeLink, markUnentitledSince, markWarned, warn, notifyRemoved]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('what the two emails actually say', () => {
  const RUNS_OUT = '2026-09-11T03:59:59.999Z';

  it('names the brokerage and the day, and promises the trades stay', () => {
    const mail = brokerLinkEndingEmail({
      institution: 'Schwab',
      removesOn: RUNS_OUT,
      siteUrl: 'https://trendchasers.net',
    });

    expect(mail.subject).toBe('Schwab sync ends Thursday, September 10');
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain('your Schwab connection');
      expect(body).toContain('Thursday, September 10');
      // The whole point of the email. Take this line out and it reads as "your data is going".
      expect(body).toContain('trades are not going anywhere');
    }
  });

  it('falls back to plain wording when the brokerage was never recorded', () => {
    const mail = brokerLinkEndingEmail({
      institution: null,
      removesOn: RUNS_OUT,
      siteUrl: 'https://trendchasers.net',
    });
    expect(mail.text).toContain('your broker connection');
    expect(mail.text).not.toContain('your null');
  });

  it('says the journal is untouched once the link has gone', () => {
    const mail = brokerLinkRemovedEmail({ institution: 'Robinhood', siteUrl: 'https://trendchasers.net' });
    expect(mail.subject).toBe('Robinhood sync has been turned off');
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain('Your journal is untouched');
      expect(body).toContain('Robinhood connection has been removed');
    }
  });

  it('renders the day in Eastern, not UTC — the clock everything else here runs on', () => {
    // 03:59:59Z is the last moment of September 10 in New York. Read as UTC it is the 11th, and
    // the email would name a day after the link had already gone.
    expect(friendlyDate(RUNS_OUT)).toBe('Thursday, September 10');
    expect(friendlyDate('not a date')).toBe('shortly');
  });
});
