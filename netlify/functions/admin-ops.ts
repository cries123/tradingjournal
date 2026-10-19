import type { Handler } from '@netlify/functions';
import { handleAdminOpsRequest, type AdminOpsRequestBody } from '../../server/adminOpsHandler';

/** Admin-only: the Ops tab's records. See server/adminOpsHandler.ts. */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: AdminOpsRequestBody = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body ?? '{}') as AdminOpsRequestBody;
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
  }

  const result = await handleAdminOpsRequest(event.headers, body);
  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
