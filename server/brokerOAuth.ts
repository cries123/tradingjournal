import type { BrokerIntegrationId } from '../src/types/broker';
import { getSchwabRedirectUri, getSiteOrigin } from './siteConfig';

const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';

export interface SchwabOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthStatus {
  schwabConfigured: boolean;
  robinhoodConfigured: boolean;
  redirectUri: string;
  missingEnv: string[];
  siteOrigin: string;
}

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = process.env[key]?.trim();
    if (val) return val;
  }
  return undefined;
}

/** Schwab portal labels these App Key / App Secret — accept common env names. */
export function getSchwabOAuthConfig(origin: string): SchwabOAuthConfig | null {
  const clientId = readEnv('SCHWAB_CLIENT_ID', 'SCHWAB_APP_KEY', 'SCHWAB_APP_ID');
  const clientSecret = readEnv('SCHWAB_CLIENT_SECRET', 'SCHWAB_APP_SECRET', 'SCHWAB_SECRET');
  if (!clientId || !clientSecret) return null;

  const redirectUri = getSchwabRedirectUri(origin);

  return { clientId, clientSecret, redirectUri };
}

export function getOAuthStatus(origin: string): OAuthStatus {
  const config = getSchwabOAuthConfig(origin);
  const missingEnv: string[] = [];
  const siteOrigin = getSiteOrigin(origin);

  if (!readEnv('SCHWAB_CLIENT_ID', 'SCHWAB_APP_KEY', 'SCHWAB_APP_ID')) {
    missingEnv.push('SCHWAB_CLIENT_ID (App Key from Schwab Developer Portal)');
  }
  if (!readEnv('SCHWAB_CLIENT_SECRET', 'SCHWAB_APP_SECRET', 'SCHWAB_SECRET')) {
    missingEnv.push('SCHWAB_CLIENT_SECRET (App Secret from Schwab Developer Portal)');
  }

  const robinhoodConfigured = Boolean(readEnv('ROBINHOOD_CLIENT_ID', 'ROBINHOOD_APP_KEY'));

  return {
    schwabConfigured: Boolean(config),
    robinhoodConfigured,
    redirectUri: config?.redirectUri ?? getSchwabRedirectUri(origin),
    missingEnv,
    siteOrigin,
  };
}

function encodeOAuthState(broker: BrokerIntegrationId): string {
  return Buffer.from(JSON.stringify({ broker, ts: Date.now() })).toString('base64url');
}

export function decodeOAuthState(state: string | undefined, fallback: BrokerIntegrationId): BrokerIntegrationId {
  if (!state) return fallback;
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { broker?: BrokerIntegrationId };
    if (parsed.broker === 'schwab' || parsed.broker === 'tos' || parsed.broker === 'robinhood') {
      return parsed.broker;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Schwab returns codes with URL-encoded characters (e.g. %40 for @). */
export function normalizeOAuthCode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function buildSchwabAuthorizeUrl(broker: BrokerIntegrationId, origin: string): string | null {
  const config = getSchwabOAuthConfig(origin);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state: encodeOAuthState(broker),
  });

  return `${SCHWAB_AUTH_URL}?${params.toString()}`;
}

export function buildRobinhoodAuthorizeUrl(origin: string): string | null {
  const clientId = readEnv('ROBINHOOD_CLIENT_ID', 'ROBINHOOD_APP_KEY');
  if (!clientId) return null;

  const redirectUri =
    readEnv('ROBINHOOD_REDIRECT_URI') ??
    `${getSiteOrigin(origin)}/api/broker-oauth-callback?broker=robinhood`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read',
    state: encodeOAuthState('robinhood'),
  });

  return `https://robinhood.com/oauth2/authorize/?${params.toString()}`;
}

export function buildOAuthRedirectUrl(broker: BrokerIntegrationId, origin: string): string | null {
  if (broker === 'schwab' || broker === 'tos') {
    return buildSchwabAuthorizeUrl(broker, origin);
  }
  if (broker === 'robinhood') {
    return buildRobinhoodAuthorizeUrl(origin);
  }
  return null;
}

export async function exchangeSchwabOAuthCode(
  code: string,
  origin: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const config = getSchwabOAuthConfig(origin);
  if (!config) {
    throw new Error(
      'Schwab OAuth is not configured on the server. Set SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET in Netlify environment variables.',
    );
  }

  const normalizedCode = normalizeOAuthCode(code);
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: normalizedCode,
      redirect_uri: config.redirectUri,
    }).toString(),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Schwab token exchange failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }

  const data = JSON.parse(bodyText) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (data.error) {
    throw new Error(data.error_description ?? data.error);
  }
  if (!data.access_token) {
    throw new Error('Schwab did not return an access token');
  }

  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function exchangeOAuthCode(
  broker: BrokerIntegrationId,
  code: string,
  origin: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  if (broker === 'schwab' || broker === 'tos') {
    return exchangeSchwabOAuthCode(code, origin);
  }

  throw new Error('OAuth token exchange is only implemented for Schwab/TOS. Use API token for Robinhood.');
}

export function oauthNotConfiguredMessage(origin: string): string {
  const status = getOAuthStatus(origin);
  if (status.missingEnv.length === 0) {
    return 'OAuth not configured. Verify Netlify env vars and redeploy.';
  }
  return `OAuth not configured. Missing Netlify env: ${status.missingEnv.join(', ')}. Register redirect URI: ${status.redirectUri}`;
}
