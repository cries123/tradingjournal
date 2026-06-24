import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { parseScreenshotWithAI, readJsonBody } from './server/parseScreenshot';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
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
        let body: { image?: string; mimeType?: string; apiKey?: string };
        try {
          body = (await readJsonBody(req)) as typeof body;
        } catch {
          sendJson(res, 413, { error: 'Request too large. Try fewer or smaller screenshots.' });
          return;
        }

        if (!body.image) {
          sendJson(res, 400, { error: 'Missing image data' });
          return;
        }

        const apiKey = body.apiKey || getApiKey() || '';
        const trades = await parseScreenshotWithAI(
          body.image,
          body.mimeType || 'image/jpeg',
          apiKey,
        );

        sendJson(res, 200, { trades });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, 500, { error: message });
      }
    })();
  };
}

export function screenshotApiPlugin(): Plugin {
  let envApiKey = '';

  return {
    name: 'screenshot-api',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      envApiKey = env.OPENAI_API_KEY || '';
    },
    configureServer(server) {
      server.middlewares.use('/api/health', (req, res) => handleHealth(req, res, () => envApiKey));
      server.middlewares.use('/api/parse-screenshot', createParseHandler(() => envApiKey));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/health', (req, res) => handleHealth(req, res, () => envApiKey));
      server.middlewares.use('/api/parse-screenshot', createParseHandler(() => envApiKey));
    },
  };
}
