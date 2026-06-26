import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleParseScreenshotRequest } from './server/parseApiHandler';
import { handleBrokerSyncRequest } from './server/brokerSyncHandler';
import {
  buildOAuthRedirectUrl,
  decodeOAuthState,
  exchangeOAuthCode,
  getOAuthStatus,
  oauthNotConfiguredMessage,
} from './server/brokerOAuth';
import { readJsonBody } from './server/parseScreenshot';
import type { BrokerSyncRequest } from './src/types/broker';
import type { BrokerIntegrationId } from './src/types/broker';

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.end(JSON.stringify(body));
}

function handleHealth(_req: IncomingMessage, res: ServerResponse, getApiKey: () => string) {
  sendJson(res, 200, { ok: true, hasApiKey: Boolean(getApiKey()) });
}

function createParseHandler(getApiKey: () => string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    void (async () => {
      try {
        let body: { image?: string; mimeType?: string; apiKey?: string; userId?: string };
        try {
          body = (await readJsonBody(req)) as typeof body;
        } catch {
          sendJson(res, 413, { error: 'Request too large. Try fewer or smaller screenshots.' });
          return;
        }

        if (!body.apiKey && getApiKey()) {
          body = { ...body, apiKey: getApiKey() };
        }

        const result = await handleParseScreenshotRequest(body, {
          'x-forwarded-for': req.headers['x-forwarded-for'] as string | undefined,
        });

        sendJson(res, result.statusCode, result.body, result.headers);
      } catch {
        sendJson(res, 500, { error: 'Internal server error' });
      }
    })();
  };
}

function handleBrokerOAuthCallback(req: IncomingMessage, res: ServerResponse, siteOrigin: string) {
  const url = new URL(req.url ?? '/', siteOrigin);
  const brokerParam = (url.searchParams.get('broker') ?? 'schwab') as BrokerIntegrationId;
  const broker = decodeOAuthState(url.searchParams.get('state') ?? undefined, brokerParam);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    const desc = url.searchParams.get('error_description') ?? oauthError;
    res.statusCode = 302;
    res.setHeader('Location', `${siteOrigin}/app?broker_oauth_error=${encodeURIComponent(desc)}`);
    res.end();
    return;
  }

  if (code) {
    void (async () => {
      try {
        const tokens = await exchangeOAuthCode(broker, code, siteOrigin);
        const params = new URLSearchParams({
          broker_oauth: '1',
          broker,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken ?? '',
        });
        res.statusCode = 302;
        res.setHeader('Location', `${siteOrigin}/app?${params.toString()}`);
        res.end();
      } catch (err) {
        const msg = encodeURIComponent(err instanceof Error ? err.message : 'OAuth failed');
        res.statusCode = 302;
        res.setHeader('Location', `${siteOrigin}/app?broker_oauth_error=${msg}`);
        res.end();
      }
    })();
    return;
  }

  const authUrl = buildOAuthRedirectUrl(broker, siteOrigin);
  if (!authUrl) {
    const message = encodeURIComponent(oauthNotConfiguredMessage(siteOrigin));
    res.statusCode = 302;
    res.setHeader('Location', `${siteOrigin}/app?broker_oauth_error=${message}`);
    res.end();
    return;
  }

  res.statusCode = 302;
  res.setHeader('Location', authUrl);
  res.end();
}

function registerApiMiddleware(server: { middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void } }, getApiKey: () => string, siteOrigin: string) {
  server.middlewares.use('/api/health', (req, res) => handleHealth(req, res, getApiKey));
  server.middlewares.use('/api/broker-oauth-status', (_req, res) => {
    sendJson(res, 200, getOAuthStatus(siteOrigin));
  });
  server.middlewares.use('/api/broker-oauth-callback', (req, res) => handleBrokerOAuthCallback(req, res, siteOrigin));
  server.middlewares.use('/api/parse-screenshot', createParseHandler(getApiKey));
  server.middlewares.use('/api/broker-sync', (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    void (async () => {
      try {
        const body = (await readJsonBody(req)) as BrokerSyncRequest;
        const result = await handleBrokerSyncRequest(body);
        sendJson(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Broker sync failed';
        sendJson(res, 400, { error: message });
      }
    })();
  });
}

export function screenshotApiPlugin(): Plugin {
  let envApiKey = '';
  let siteOrigin = 'http://localhost:5173';

  return {
    name: 'screenshot-api',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      envApiKey = env.OPENAI_API_KEY || '';
      siteOrigin = env.URL?.replace(/\/$/, '') || env.VITE_SITE_URL?.replace(/\/$/, '') || 'http://localhost:5173';
    },
    configureServer(server) {
      registerApiMiddleware(server, () => envApiKey, siteOrigin);
    },
    configurePreviewServer(server) {
      registerApiMiddleware(server, () => envApiKey, siteOrigin);
    },
  };
}
