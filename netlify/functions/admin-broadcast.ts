import type { Handler } from '@netlify/functions';
import { handleAdminBroadcastRequest, type AdminBroadcastRequestBody } from '../../server/adminBroadcastHandler';

/**
 * How long one call may spend sending. Netlify ends a synchronous function at ten seconds; two are
 * left for the totals, the response and a cold start, and the panel simply calls again.
 */
const BUDGET_MS = 8_000;

/** Admin-only: the Email tab. See server/adminBroadcastHandler.ts. */
export const handler: Handler = async (event) => {
  const deadline = Date.now() + BUDGET_MS;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: AdminBroadcastRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as AdminBroadcastRequestBody;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const result = await handleAdminBroadcastRequest(event.headers, body, deadline);
  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
