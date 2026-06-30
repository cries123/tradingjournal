import type { Handler } from '@netlify/functions';
import { handleAdminUserRequest, type AdminUserRequestBody } from '../../server/adminUserHandler';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: AdminUserRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as AdminUserRequestBody;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const result = await handleAdminUserRequest(event.headers, body);

  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
