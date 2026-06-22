import type { Plugin } from 'vite';
import { parseScreenshotWithAI, readJsonBody } from './server/parseScreenshot';

export function screenshotApiPlugin(): Plugin {
  return {
    name: 'screenshot-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-screenshot', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = (await readJsonBody(req)) as {
            image?: string;
            mimeType?: string;
            apiKey?: string;
          };

          if (!body.image) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing image data' }));
            return;
          }

          const apiKey = body.apiKey || process.env.OPENAI_API_KEY || '';
          const trades = await parseScreenshotWithAI(
            body.image,
            body.mimeType || 'image/png',
            apiKey,
          );

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ trades }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/parse-screenshot', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = (await readJsonBody(req)) as {
            image?: string;
            mimeType?: string;
            apiKey?: string;
          };

          if (!body.image) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing image data' }));
            return;
          }

          const apiKey = body.apiKey || process.env.OPENAI_API_KEY || '';
          const trades = await parseScreenshotWithAI(
            body.image,
            body.mimeType || 'image/png',
            apiKey,
          );

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ trades }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}
