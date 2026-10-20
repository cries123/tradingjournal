import type { Handler } from '@netlify/functions';
import { handleTradePathsRequest } from '../../server/tradePaths';

/** POST /api/trade-paths — stored minute bars behind a list of trades. See server/tradePaths.ts. */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body || '{}') as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const result = await handleTradePathsRequest(event.headers, body);
  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
