import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleParseScreenshotRequest } from './server/parseApiHandler';
import { readJsonBody } from './server/parseScreenshot';

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
      server.middlewares.use('/api/benchmark', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url ?? '', 'http://localhost');
            const { handleBenchmarkRequest } = await import('./server/benchmarkHandler');
            const result = await handleBenchmarkRequest(url.searchParams.get('symbol'));
            sendJson(res, result.statusCode, result.body);
          } catch {
            sendJson(res, 502, { error: 'Benchmark fetch failed' });
          }
        })();
      });
      server.middlewares.use('/api/admin-user', (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }
        void (async () => {
          try {
            const body = (await readJsonBody(req)) as import('./server/adminUserHandler').AdminUserRequestBody;
            const { handleAdminUserRequest } = await import('./server/adminUserHandler');
            const result = await handleAdminUserRequest(req.headers, body);
            sendJson(res, result.statusCode, result.body);
          } catch {
            sendJson(res, 500, { error: 'Internal server error' });
          }
        })();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/health', (req, res) => handleHealth(req, res, () => envApiKey));
      server.middlewares.use('/api/parse-screenshot', createParseHandler(() => envApiKey));
      server.middlewares.use('/api/benchmark', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url ?? '', 'http://localhost');
            const { handleBenchmarkRequest } = await import('./server/benchmarkHandler');
            const result = await handleBenchmarkRequest(url.searchParams.get('symbol'));
            sendJson(res, result.statusCode, result.body);
          } catch {
            sendJson(res, 502, { error: 'Benchmark fetch failed' });
          }
        })();
      });
      server.middlewares.use('/api/admin-user', (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }
        void (async () => {
          try {
            const body = (await readJsonBody(req)) as import('./server/adminUserHandler').AdminUserRequestBody;
            const { handleAdminUserRequest } = await import('./server/adminUserHandler');
            const result = await handleAdminUserRequest(req.headers, body);
            sendJson(res, result.statusCode, result.body);
          } catch {
            sendJson(res, 500, { error: 'Internal server error' });
          }
        })();
      });
    },
  };
}
