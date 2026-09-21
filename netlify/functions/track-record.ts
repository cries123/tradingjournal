import type { Handler, HandlerResponse } from '@netlify/functions';
import { assertCallerUid, BrokerRequestError } from '../../server/snaptradeAuth';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import {
  publishTrackRecord,
  TrackRecordError,
  unpublishTrackRecord,
} from '../../server/trackRecordHandler';
import { readEntitlement, effectiveTier } from '../../server/entitlements';
import { tierHas } from '../../src/config/tiers';

/**
 * Publish or take down the signed-in trader's verified record.
 *
 * The uid comes from the verified ID token and the figures are computed here from their own
 * trades, so nothing a client sends can change what the page says — only whether it exists and
 * how much of it is shown.
 */

const json = (statusCode: number, body: unknown): HandlerResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let uid: string;
  try {
    uid = await assertCallerUid(event.headers);
  } catch (err) {
    return json(err instanceof BrokerRequestError ? err.statusCode : 401, {
      error: err instanceof Error ? err.message : 'Sign in required',
    });
  }

  let body: { action?: string; showAmounts?: unknown; anonymous?: unknown; journals?: unknown };
  try {
    body = JSON.parse(event.body ?? '{}') as typeof body;
  } catch {
    return json(400, { error: 'Bad request' });
  }

  try {
    const profile = await getAdminFirestore().doc(`users/${uid}`).get();
    const username = (profile.data() as { username?: string } | undefined)?.username ?? null;

    if (body.action === 'unpublish') {
      await unpublishTrackRecord(uid, username);
      return json(200, { published: false });
    }

    /*
     * Paid plans only, checked here rather than in the browser.
     *
     * Not the strictest gate in the product — every published page links back here, so throttling
     * it throttles the thing it exists to create — but a free account publishing a page branded
     * "verified by Trend Chasers" is the product vouching for somebody who is not a customer.
     *
     * Reads the same tier flag the sidebar's paywall reads, rather than testing for 'free'
     * separately. Two gates spelled differently agree until the day the plan moves, and then
     * one of them is a screen that offers a button the server refuses.
     */
    const tier = effectiveTier(await readEntitlement(uid), Date.now());
    if (!tierHas(tier, 'trackRecord')) {
      return json(402, { error: 'Publishing a verified record is part of a paid plan.' });
    }

    const result = await publishTrackRecord(uid, username, {
      showAmounts: body.showAmounts !== false,
      anonymous: body.anonymous === true,
      // Anything that is not an array of strings is treated as "no selection", i.e. every
      // journal — the inclusive answer, so a malformed body cannot quietly narrow a record.
      journals: Array.isArray(body.journals)
        ? body.journals.filter((j): j is string => typeof j === 'string')
        : null,
    });
    return json(200, { published: true, ...result });
  } catch (err) {
    if (err instanceof TrackRecordError) return json(err.statusCode, { error: err.message });
    console.error('[track-record] failed:', err);
    return json(500, { error: 'Something went wrong. Try again shortly.' });
  }
};
