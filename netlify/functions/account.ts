import type { Handler, HandlerResponse } from '@netlify/functions';
import { recordJournalEvent } from '../../server/journalEvents';
import { assertCallerUid, BrokerRequestError } from '../../server/snaptradeAuth';
import {
  AccountRequestError,
  deleteOwnAccount,
  readOrderHistory,
  renameUsernameFor,
} from '../../server/accountHandler';

/**
 * The signed-in account's own username and payment history.
 *
 * The uid always comes from the verified ID token and never from the body, so there is no shape of
 * request that reads somebody else's orders or renames somebody else's account.
 */

const json = (statusCode: number, body: unknown): HandlerResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let uid: string;
  try {
    uid = await assertCallerUid(event.headers);
  } catch (err) {
    return json(err instanceof BrokerRequestError ? err.statusCode : 401, {
      error: err instanceof Error ? err.message : 'Sign in required',
    });
  }

  let body: {
    action?: string;
    username?: string;
    confirmation?: string;
    tradesRemoved?: unknown;
    journalId?: unknown;
    journalName?: unknown;
  };
  try {
    body = JSON.parse(event.body ?? '{}') as typeof body;
  } catch {
    return json(400, { error: 'Bad request' });
  }

  try {
    if (body.action === 'journalCleared') {
      /*
       * A note that somebody wiped a journal, for the support history.
       *
       * Reported by the client because the delete itself happens there, which means the count
       * is the browser’s word rather than something observed. That is fine for what it is —
       * a support breadcrumb explaining why an account went from 400 trades to none, not an
       * audit record. It is written under the caller’s own uid from their verified token, so
       * nobody can write history onto somebody else’s account.
       */
      await recordJournalEvent(uid, {
        type: 'clear',
        at: new Date().toISOString(),
        clear: {
          tradesRemoved: typeof body.tradesRemoved === 'number' ? body.tradesRemoved : 0,
          journalId: typeof body.journalId === 'string' ? body.journalId : 'unknown',
          journalName: typeof body.journalName === 'string' ? body.journalName : null,
        },
      });
      return json(200, { ok: true });
    }

    if (body.action === 'orderHistory') {
      return json(200, await readOrderHistory(uid));
    }

    if (body.action === 'renameUsername') {
      if (typeof body.username !== 'string') {
        return json(400, { error: 'Pick a username.' });
      }
      return json(200, await renameUsernameFor(uid, body.username));
    }

    if (body.action === 'deleteAccount') {
      return json(200, await deleteOwnAccount(uid, body.confirmation ?? ''));
    }

    return json(400, { error: 'Unknown action' });
  } catch (err) {
    if (err instanceof AccountRequestError) {
      return json(err.statusCode, { error: err.message });
    }
    console.error('[account] failed:', err);
    return json(500, { error: 'Something went wrong. Try again shortly.' });
  }
};
