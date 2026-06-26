export interface OAuthStatusResponse {
  schwabConfigured: boolean;
  robinhoodConfigured: boolean;
  redirectUri: string;
  missingEnv: string[];
  siteOrigin: string;
}

export async function fetchOAuthStatus(): Promise<OAuthStatusResponse | null> {
  try {
    const res = await fetch('/api/broker-oauth-status');
    if (!res.ok) return null;
    return (await res.json()) as OAuthStatusResponse;
  } catch {
    return null;
  }
}
