import { describe, expect, it } from 'vitest';
import {
  refundNotice,
  remainingAfterSync,
  shouldRefundSync,
  type SyncOutcome,
} from './syncRefund';

/*
 * A customer cancelled over this.
 *
 * Their words: "I cannot continue syncing my trades and the system not uploading them and wasting
 * my sync for the day." Both halves were true. The allowance was spent before the pull and handed
 * back only for an upstream outage, so a sync that returned zero trades — a 200, no error, nothing
 * to import — was charged exactly like one that returned fifty. They had two broker connections,
 * so one refresh cost 2 of their 5.
 *
 * These pin the rule rather than the plumbing: which outcomes cost a sync is the decision that was
 * wrong, and it is the kind of thing that gets quietly re-broken by someone tidying a switch.
 */

const ALL: SyncOutcome[] = [
  'trades',
  'empty-feed',
  'nothing-matched',
  'upstream-outage',
  'credential-rejected',
  'rate-limited',
  'our-fault',
  'bad-request',
];

describe('shouldRefundSync', () => {
  it('charges a sync that actually produced trades', () => {
    expect(shouldRefundSync('trades')).toBe(false);
  });

  it('refunds the two outcomes that look like success and are not', () => {
    /*
     * The heart of it. Neither of these is an error by any HTTP measure — the broker answered, the
     * server returned 200 — and both leave the trader with nothing. nothing-matched is routine for
     * an options trader whose closes have no opening fill inside the window.
     */
    expect(shouldRefundSync('empty-feed')).toBe(true);
    expect(shouldRefundSync('nothing-matched')).toBe(true);
  });

  it('refunds every failure that was not the caller asking for something impossible', () => {
    expect(shouldRefundSync('upstream-outage')).toBe(true);
    expect(shouldRefundSync('credential-rejected')).toBe(true);
    expect(shouldRefundSync('rate-limited')).toBe(true);
    expect(shouldRefundSync('our-fault')).toBe(true);
  });

  it('still charges a malformed request, on purpose', () => {
    // Not because it is clearly fair — a bad account id is arguably our bug — but because the daily
    // cap is the only thing stopping a client looping bad requests.
    expect(shouldRefundSync('bad-request')).toBe(false);
  });

  it('has an answer for every outcome, so a new one cannot slip through unhandled', () => {
    for (const outcome of ALL) {
      expect(typeof shouldRefundSync(outcome), outcome).toBe('boolean');
    }
  });
});

describe('remainingAfterSync', () => {
  it('gives the sync back on the meter, not just in the database', () => {
    // The browser cannot work this out for itself. Before the server sent it, the badge counted
    // down on every failure and a run of fruitless syncs drained a display the account had not
    // actually spent.
    expect(remainingAfterSync(3, true)).toBe(4);
  });

  it('leaves the meter alone when the sync was earned', () => {
    expect(remainingAfterSync(3, false)).toBe(3);
  });

  it('can hand back the last one from zero', () => {
    // Somebody on their final sync of the day is exactly who notices this.
    expect(remainingAfterSync(0, true)).toBe(1);
  });
});

describe('refundNotice', () => {
  it('says nothing when the sync was charged', () => {
    expect(refundNotice('trades')).toBeNull();
    expect(refundNotice('bad-request')).toBeNull();
  });

  it('tells the trader an empty sync cost them nothing', () => {
    // "Nothing came back" and "nothing came back, and it did not cost you a sync" are different
    // messages. The gap between them ended a subscription.
    expect(refundNotice('empty-feed')).toContain('did not use one of your syncs');
    expect(refundNotice('nothing-matched')).toContain('nothing came back');
  });

  it('is plainer about a failure, where blaming the feed would be wrong', () => {
    const notice = refundNotice('upstream-outage');
    expect(notice).toContain('did not use one of your syncs');
    expect(notice).not.toContain('nothing came back');
  });
});
