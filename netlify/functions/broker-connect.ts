import type { Handler } from '@netlify/functions';
import {
  functionDeadline,
  handleBrokerConnectRequest,
  type BrokerConnectRequestBody,
} from '../../server/brokerConnectHandler';

export const handler: Handler = async (event, context) => {
  /*
   * The clock the sync pages against, read before anything else runs.
   *
   * The runtime says how long is left — a cold start has already spent some of the limit — and
   * the handler caps it at the limit it was configured for, since the figure Lambda reports and
   * the one Netlify's gateway cuts at are not known to agree. Absent (the local dev server), the
   * configured limit from now.
   */
  const remaining =
    typeof context?.getRemainingTimeInMillis === 'function' ? context.getRemainingTimeInMillis() : undefined;
  const deadline = functionDeadline(Date.now(), remaining);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: BrokerConnectRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as BrokerConnectRequestBody;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const result = await handleBrokerConnectRequest(event.headers, body, { deadline });

  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
