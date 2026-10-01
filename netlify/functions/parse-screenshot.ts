import type { Handler } from '@netlify/functions';
import { handleParseScreenshotRequest } from '../../server/parseApiHandler';
import { assertCallerUid, BrokerRequestError } from '../../server/snaptradeAuth';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  /*
   * Signed in, or no vision call.
   *
   * This was the one model endpoint in the repo that verified nothing — ai-assistant,
   * ai-takeaway and broker-connect all call assertCallerUid, and this did not. Worse, the only
   * ceiling was an in-memory bucket keyed on body.userId, a value the CALLER supplies: a fresh
   * random id per request lands in an empty bucket, so the 20/hour limit never applied. With
   * OPENAI_API_KEY set in production and the endpoint URL in the shipped bundle, anyone who
   * read the site’s JavaScript could run gpt-4o vision on the owner’s card indefinitely.
   *
   * The uid now comes from a verified ID token and the body’s userId is ignored entirely.
   */
  let callerUid: string;
  try {
    callerUid = await assertCallerUid(event.headers);
  } catch (err) {
    return {
      statusCode: err instanceof BrokerRequestError ? err.statusCode : 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Sign in required' }),
    };
  }

  try {
    let body: { image?: string; mimeType?: string; apiKey?: string; userId?: string };
    try {
      body = JSON.parse(event.body || '{}') as typeof body;
    } catch {
      return {
        statusCode: 413,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request too large. Try fewer or smaller screenshots.' }),
      };
    }

    const result = await handleParseScreenshotRequest({ ...body, userId: callerUid }, {
      'x-forwarded-for': event.headers['x-forwarded-for'],
      'x-nf-client-connection-ip': event.headers['x-nf-client-connection-ip'],
      'client-ip': event.headers['client-ip'],
    });

    return {
      statusCode: result.statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...result.headers,
      },
      body: JSON.stringify(result.body),
    };
  } catch {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
