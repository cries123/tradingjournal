#!/usr/bin/env node
/**
 * Post-build prerender for public marketing routes.
 * Uses Playwright to capture fully rendered HTML (meta tags + page content).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const host = '127.0.0.1';

const ROUTES = [
  '/',
  '/brokers',
  '/brokers/thinkorswim',
  '/brokers/charles-schwab',
  '/brokers/robinhood',
  '/guides',
  '/guides/free-trading-journal',
  '/guides/trading-journal-without-broker-login',
  '/guides/pnl-calendar-trading-journal',
  '/privacy',
  '/terms',
  '/request-broker',
  '/report-bug',
];

function findFreePort(start = 4173) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && start < 4200) {
        resolve(findFreePort(start + 1));
        return;
      }
      reject(err);
    });
    server.listen(start, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : start;
      server.close(() => resolve(port));
    });
  });
}

function waitForServerReady(url, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url)
        .then((res) => {
          if (res.ok) resolve(undefined);
          else retry();
        })
        .catch(() => retry());
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Preview server did not start in time'));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function startPreviewServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vite', 'preview', '--host', host, '--port', String(port), '--strictPort'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
      detached: process.platform !== 'win32',
    });

    child.on('error', reject);

    resolve({ child });
  });
}

function stopPreviewServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }

    child.stdout?.destroy();
    child.stderr?.destroy();

    const finish = () => {
      clearTimeout(forceKill);
      resolve();
    };

    const forceKill = setTimeout(() => {
      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // already exited
      }
      finish();
    }, 3000);

    child.once('exit', finish);

    try {
      if (process.platform !== 'win32' && child.pid) {
        process.kill(-child.pid, 'SIGTERM');
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      finish();
    }
  });
}

function outputPathForRoute(route) {
  if (route === '/') return path.join(distDir, 'index.html');
  return path.join(distDir, route.slice(1), 'index.html');
}

async function prerenderRoute(page, baseUrl, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForSelector('#root > *', { timeout: 15_000 });
  // Lazy-loaded routes show a [data-route-loading] fallback until their chunk resolves.
  await page.waitForFunction(() => !document.querySelector('[data-route-loading]'), {
    timeout: 15_000,
  });
  await page.waitForFunction(() => document.title.length > 0);
  await page.waitForTimeout(400);

  const html = await page.content();
  const outPath = outputPathForRoute(route);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`  prerendered ${route} → ${path.relative(root, outPath)}`);
}

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error('dist/ not found — run vite build first');
    process.exit(1);
  }

  if (process.env.SKIP_PRERENDER === '1') {
    console.log('SKIP_PRERENDER=1 — skipping prerender');
    return;
  }

  console.log('Installing Playwright Chromium if needed…');
  await new Promise((resolve, reject) => {
    const install = spawn('npx', ['playwright', 'install', 'chromium'], {
      cwd: root,
      stdio: 'inherit',
    });
    install.on('close', (code) => (code === 0 ? resolve(undefined) : reject(new Error('playwright install failed'))));
  });

  console.log('Starting preview server…');
  const port = await findFreePort();
  const baseUrl = `http://${host}:${port}`;
  const { child: server } = await startPreviewServer(port);

  try {
    await waitForServerReady(baseUrl);
    console.log(`Prerendering ${ROUTES.length} routes at ${baseUrl}…`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const route of ROUTES) {
      await prerenderRoute(page, baseUrl, route);
    }

    await browser.close();
    console.log('Prerender complete.');
  } finally {
    await stopPreviewServer(server);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
