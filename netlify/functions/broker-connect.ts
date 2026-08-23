import type { Handler } from '@netlify/functions';
import { handleBrokerConnectRequest, type BrokerConnectRequestBody } from '../../server/brokerConnectHandler';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: BrokerConnectRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as BrokerConnectRequestBody;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const result = await handleBrokerConnectRequest(event.headers, body);

  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
