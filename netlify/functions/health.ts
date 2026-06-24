import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, hasApiKey }),
  };
};
