import type { Handler } from '@netlify/functions';
import { getOAuthStatus } from '../../server/brokerOAuth';

function originFromEvent(event: { headers: Record<string, string | undefined> }): string {
  const siteUrl = process.env.URL?.replace(/\/$/, '');
  if (siteUrl) return siteUrl;

  const host = event.headers.host ?? event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] ?? 'https';
  return host ? `${proto}://${host}` : 'http://localhost:5173';
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const origin = originFromEvent(event);
  const status = getOAuthStatus(origin);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(status),
  };
};
