import type { Handler, HandlerResponse } from '@netlify/functions';
import { handleStartTrial } from '../../server/trialHandler';

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const result = await handleStartTrial(event.headers);
  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(result.body),
  };
};
