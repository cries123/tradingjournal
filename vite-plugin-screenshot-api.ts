import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin } from 'vite';
import { parseScreenshotWithAI, readJsonBody } from './server/parseScreenshot';

function handleParseScreenshot(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  void (async () => {
    try {
      let body: { image?: string; mimeType?: string; apiKey?: string };
      try {
        body = (await readJsonBody(req)) as typeof body;
      } catch {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Request too large. Try fewer or smaller screenshots.' }));
        return;
      }

      if (!body.image) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing image data' }));
        return;
      }

      const apiKey = body.apiKey || process.env.OPENAI_API_KEY || '';
      const trades = await parseScreenshotWithAI(
        body.image,
        body.mimeType || 'image/jpeg',
        apiKey,
      );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ trades }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: message }));
    }
  })();
}

export function screenshotApiPlugin(): Plugin {
  return {
    name: 'screenshot-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-screenshot', handleParseScreenshot);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/parse-screenshot', handleParseScreenshot);
    },
  };
}
