import type { Handler } from '@netlify/functions';
import { buildOAuthRedirectUrl, exchangeOAuthCode } from '../../server/brokerSyncHandler';
import type { BrokerIntegrationId } from '../../src/types/broker';

function originFromEvent(event: { headers: Record<string, string | undefined> }): string {
  const host = event.headers.host ?? event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] ?? 'https';
  return host ? `${proto}://${host}` : 'http://localhost:5173';
}

export const handler: Handler = async (event) => {
  const origin = originFromEvent(event);
  const broker = (event.queryStringParameters?.broker ?? 'schwab') as BrokerIntegrationId;
  const code = event.queryStringParameters?.code;

  if (code) {
    try {
      const tokens = await exchangeOAuthCode(broker, code, origin);
      const params = new URLSearchParams({
        broker,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? '',
      });
      return {
        statusCode: 302,
        headers: { Location: `${origin}/app?broker_oauth=1&${params.toString()}` },
        body: '',
      };
    } catch (err) {
      const msg = encodeURIComponent(err instanceof Error ? err.message : 'OAuth failed');
      return {
        statusCode: 302,
        headers: { Location: `${origin}/app?broker_oauth_error=${msg}` },
        body: '',
      };
    }
  }

  const url = buildOAuthRedirectUrl(broker, origin);
  if (!url) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'OAuth not configured. Use API token connect in Settings.' }),
    };
  }

  return {
    statusCode: 302,
    headers: { Location: url },
    body: '',
  };
};
