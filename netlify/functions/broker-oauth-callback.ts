import type { Handler } from '@netlify/functions';
import {
  buildOAuthRedirectUrl,
  decodeOAuthState,
  exchangeOAuthCode,
  oauthNotConfiguredMessage,
} from '../../server/brokerOAuth';
import type { BrokerIntegrationId } from '../../src/types/broker';

function originFromEvent(event: { headers: Record<string, string | undefined> }): string {
  const siteUrl = process.env.URL?.replace(/\/$/, '');
  if (siteUrl) return siteUrl;

  const host = event.headers.host ?? event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] ?? 'https';
  return host ? `${proto}://${host}` : 'http://localhost:5173';
}

export const handler: Handler = async (event) => {
  const origin = originFromEvent(event);
  const query = event.queryStringParameters ?? {};
  const brokerParam = (query.broker ?? 'schwab') as BrokerIntegrationId;
  const broker = decodeOAuthState(query.state, brokerParam);
  const code = query.code;
  const oauthError = query.error;

  if (oauthError) {
    const desc = query.error_description ?? oauthError;
    return {
      statusCode: 302,
      headers: { Location: `${origin}/app?broker_oauth_error=${encodeURIComponent(desc)}` },
      body: '',
    };
  }

  if (code) {
    try {
      const tokens = await exchangeOAuthCode(broker, code, origin);
      const params = new URLSearchParams({
        broker_oauth: '1',
        broker,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? '',
      });
      return {
        statusCode: 302,
        headers: { Location: `${origin}/app?${params.toString()}` },
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
    const message = encodeURIComponent(oauthNotConfiguredMessage(origin));
    return {
      statusCode: 302,
      headers: { Location: `${origin}/app?broker_oauth_error=${message}` },
      body: '',
    };
  }

  return {
    statusCode: 302,
    headers: { Location: url },
    body: '',
  };
};
