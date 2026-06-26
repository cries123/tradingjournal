import { SITE_ORIGIN } from '../src/config/site';

function trimOrigin(url: string): string {
  return url.replace(/\/$/, '');
}

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = process.env[key]?.trim();
    if (val) return trimOrigin(val);
  }
  return undefined;
}

/** Preferred public site origin for OAuth redirects and absolute URLs. */
export function getSiteOrigin(requestOrigin?: string): string {
  return (
    readEnv('SITE_URL', 'PUBLIC_SITE_URL', 'VITE_SITE_URL', 'URL') ??
    (requestOrigin ? trimOrigin(requestOrigin) : undefined) ??
    SITE_ORIGIN
  );
}

export function getSchwabRedirectUri(requestOrigin?: string): string {
  return (
    readEnv('SCHWAB_REDIRECT_URI') ?? `${getSiteOrigin(requestOrigin)}/api/broker-oauth-callback`
  );
}
