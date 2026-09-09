import type { Handler } from '@netlify/functions';
import { handleCoachSeatRequest, type CoachSeatRequest } from '../../server/coachSeatHandler';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: CoachSeatRequest;
  try {
    body = JSON.parse(event.body ?? '{}') as CoachSeatRequest;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const result = await handleCoachSeatRequest(event.headers, body);

  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
