import type { Handler } from '@netlify/functions';
import { SNAPTRADE_CONFIGURED } from '../../server/snaptradeClient';

/** Public, unauthenticated check for whether broker connect is configured server-side.
 * Used by the admin health panel and by the client to show a graceful "not set up yet"
 * state instead of a raw error when SNAPTRADE_CLIENT_ID/CONSUMER_KEY aren't set. */
export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, configured: SNAPTRADE_CONFIGURED }),
  };
};
