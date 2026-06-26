import type { Handler } from '@netlify/functions';
import { handleParseScreenshotRequest } from '../../server/parseApiHandler';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
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

    const result = await handleParseScreenshotRequest(body, {
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
