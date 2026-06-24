import type { Handler } from '@netlify/functions';
import { parseScreenshotWithAI } from '../../server/parseScreenshot';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    let body: { image?: string; mimeType?: string; apiKey?: string };
    try {
      body = JSON.parse(event.body || '{}') as typeof body;
    } catch {
      return {
        statusCode: 413,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request too large. Try fewer or smaller screenshots.' }),
      };
    }

    if (!body.image) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing image data' }),
      };
    }

    const apiKey = body.apiKey || process.env.OPENAI_API_KEY || '';
    const trades = await parseScreenshotWithAI(
      body.image,
      body.mimeType || 'image/jpeg',
      apiKey,
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }
};
