// node shots.mjs <html dir> <out dir> [only-name,...]
// Screenshots the rendered harness pages at 2x and writes each crop as WebP, encoded by Chromium.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire('C:/Users/disco/Desktop/blackbook CRM/tradingjournal/package.json');
const { chromium } = require('playwright');

const [htmlDir, outDir, only] = process.argv.slice(2);
const wanted = only ? new Set(only.split(',')) : null;
mkdirSync(outDir, { recursive: true });
const MAX_BYTES = 180 * 1024;
const PAD = 12;

const browser = await chromium.launch({ executablePath: 'C:\\Users\\disco\\AppData\\Local\\ms-playwright\\chromium-1200\\chrome-win64\\chrome.exe' });
const encoder = await browser.newPage();
await encoder.setContent('<html><body></body></html>');

/** PNG bytes to WebP bytes, at the highest quality from 0.88 down that fits under the size cap. */
async function toWebp(png) {
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  for (const q of [0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6]) {
    const b64 = await encoder.evaluate(
      async ({ src, q }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/webp', q).split(',')[1];
      },
      { src: dataUrl, q },
    );
    const buf = Buffer.from(b64, 'base64');
    if (buf.length <= MAX_BYTES || q === 0.6) return { buf, q };
  }
}

async function open(file, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(resolve(join(htmlDir, file))).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const figtree = await page.evaluate(() => document.fonts.check('600 16px Figtree'));
  if (!figtree) throw new Error(`${file}: Figtree did not load`);
  await page.waitForTimeout(250);
  return { ctx, page };
}

const rectOf = (page, fn, arg) => page.evaluate(fn, arg);
const padded = (r, pad = PAD) => ({ x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 });

async function save(name, page, clip, opts = {}) {
  const png = await page.screenshot({ clip, fullPage: opts.fullPage ?? true, omitBackground: opts.omitBackground ?? false });
  const { buf, q } = await toWebp(png);
  writeFileSync(join(outDir, `${name}.webp`), buf);
  const px = await encoder.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return `${img.naturalWidth}x${img.naturalHeight}`;
  }, `data:image/webp;base64,${buf.toString('base64')}`);
  console.log(`${name}.webp ${px} ${buf.length} bytes q=${q} (css clip ${Math.round(clip.width)}x${Math.round(clip.height)})`);
}

/** The bounding box of every selector given, in page coordinates. */
function union(selectors) {
  const rects = selectors.map((s) => {
    const el = typeof s === 'string' ? document.querySelector(s) : null;
    if (!el) throw new Error(`missing ${s}`);
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY };
  });
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.r)) - x, height: Math.max(...rects.map((r) => r.b)) - y };
}

/** The element holding a piece of text, walked up to the nearest match of `up`. */
function byText({ tag, text, up }) {
  const el = [...document.querySelectorAll(tag)].find((e) => e.textContent.trim().startsWith(text) && e.getBoundingClientRect().width > 0);
  if (!el) throw new Error(`no ${tag} "${text}"`);
  const box = (up ? el.closest(up) : el).getBoundingClientRect();
  return { x: box.left + scrollX, y: box.top + scrollY, width: box.width, height: box.height };
}

const jobs = {
  async 'shot-performance'() {
    const { ctx, page } = await open('d-performance.html', { width: 1440, height: 900 });
    const r = await rectOf(page, union, ['section.grid-cols-6', 'section[aria-label="The verdict"]']);
    await save('shot-performance', page, padded(r));
    await ctx.close();
  },
  async 'shot-ask'() {
    // 1440x1052: tall enough that both answers sit in the column without it scrolling.
    const { ctx, page } = await open('d-ask.html', { width: 1440, height: 1052 });
    // From the column's top to just under the second answer's Copy button, above the follow-up chips.
    const r = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Conversation"]');
      const scroller = section.querySelector('.lg\\:overflow-y-auto');
      const turns = [...section.querySelectorAll('.animate-msg-in')];
      const last = turns[turns.length - 1];
      const answer = last.children[0].getBoundingClientRect();
      const chips = last.children[1]?.getBoundingClientRect();
      const box = section.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (answer.bottom > view.bottom) throw new Error(`second answer runs ${answer.bottom - view.bottom}px past the column`);
      const bottom = answer.bottom + 8;
      if (chips && bottom >= chips.top) throw new Error('crop would reach the chips');
      return { x: box.left - 12, y: box.top - 12, width: box.width + 24, height: bottom - (box.top - 12), gap: chips ? chips.top - answer.bottom : null };
    });
    console.log(`  ask: chips start ${r.gap}px under the answer; crop ends 8px under it`);
    delete r.gap;
    await save('shot-ask', page, r);
    await ctx.close();
  },
  async 'shot-day'() {
    const { ctx, page } = await open('d-day.html', { width: 1440, height: 900 });
    const r = await rectOf(page, byText, { tag: 'p', text: 'Day result', up: 'section' });
    await save('shot-day', page, padded(r));
    await ctx.close();
  },
  async 'shot-calendar'() {
    const { ctx, page } = await open('d-overview.html', { width: 1440, height: 900 });
    const r = await rectOf(page, byText, { tag: 'h2', text: 'Calendar', up: 'section' });
    await save('shot-calendar', page, padded(r));
    await ctx.close();
  },
  async 'shot-trade'() {
    const { ctx, page } = await open('d-trades.html', { width: 1440, height: 900 });
    const r = await rectOf(page, union, ['aside.panel-card']);
    await save('shot-trade', page, padded(r));
    await ctx.close();
  },
  async 'phone-overview'() {
    const { ctx, page } = await open('p-overview.html', { width: 390, height: 844 });
    const top = await page.evaluate(() => Math.ceil(document.querySelector('#shot-header').getBoundingClientRect().bottom));
    await save('phone-overview', page, { x: 0, y: top, width: 390, height: 800 });
    await ctx.close();
  },
  async 'phone-performance'() {
    const { ctx, page } = await open('p-performance.html', { width: 390, height: 844 });
    const top = await page.evaluate(() => Math.ceil(document.querySelector('#shot-header').getBoundingClientRect().bottom));
    await save('phone-performance', page, { x: 0, y: top, width: 390, height: 800 });
    await ctx.close();
  },
  async 'phone-ask'() {
    const { ctx, page } = await open('p-ask.html', { width: 390, height: 844 });
    /* Scrolled to the end of the conversation, as the app opens one, but stopped where the second
       answer's card ends just above the message box: the follow-up chips under it sit behind the box. */
    const fit = await page.evaluate(() => {
      const main = document.querySelector('main');
      const section = document.querySelector('section[aria-label="Conversation"]');
      const box = () => section.querySelector('form').parentElement.getBoundingClientRect();
      const turns = [...section.querySelectorAll('.animate-msg-in')];
      const last = turns[turns.length - 1];
      const card = () => last.children[0].querySelector('.rounded-\\[4px_18px_18px_18px\\]').getBoundingClientRect();
      main.scrollTop = main.scrollHeight;
      for (let i = 0; i < 3; i++) main.scrollTop += card().bottom - (box().top - 2);
      const chips = last.children[1].getBoundingClientRect();
      return { scrollTop: main.scrollTop, max: main.scrollHeight - main.clientHeight, cardBottom: card().bottom, boxTop: box().top, boxBottom: box().bottom, chipsTop: chips.top, chipsBottom: chips.bottom };
    });
    console.log(`  phone ask: ${JSON.stringify(fit)}`);
    if (fit.chipsTop < fit.boxTop || fit.chipsBottom > fit.boxBottom) throw new Error('a chip shows outside the message box');
    const top = await page.evaluate(() => Math.ceil(document.querySelector('#shot-header').getBoundingClientRect().bottom));
    await save('phone-ask', page, { x: 0, y: top, width: 390, height: 844 - top }, { fullPage: false });
    await ctx.close();
  },
  async 'phone-day'() {
    const { ctx, page } = await open('p-day.html', { width: 390, height: 844 });
    // Only the sheet: the page behind it and the dimming are taken away, so its rounded corners are clear.
    await page.addStyleTag({
      content: `html, body, #root { background: transparent !important; } #root > .app-spotlight { visibility: hidden !important; } button[aria-label="Close the day"] { display: none !important; }`,
    });
    const fit = await page.evaluate(() => {
      const s = document.querySelector('[role="dialog"] .overflow-y-auto');
      return s.scrollHeight - s.clientHeight;
    });
    if (fit > 0) throw new Error(`day sheet scrolls by ${fit}px at 844 tall`);
    const r = await page.evaluate(() => {
      const sheet = document.querySelector('[role="dialog"]').getBoundingClientRect();
      const last = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.includes('Import a CSV')).getBoundingClientRect();
      return { x: 0, y: sheet.top, width: 390, height: last.bottom + 24 - sheet.top };
    });
    await save('phone-day', page, r, { fullPage: false, omitBackground: true });
    await ctx.close();
  },
  async 'phone-calendar'() {
    const { ctx, page } = await open('p-overview.html', { width: 390, height: 844 });
    const r = await page.evaluate(() => {
      const legend = [...document.querySelectorAll('section span')].find((s) => s.textContent.trim() === 'Broke a rule' && s.getBoundingClientRect().width > 0);
      const section = legend.closest('section').getBoundingClientRect();
      const row = legend.parentElement.getBoundingClientRect();
      return { x: 0, y: section.top + scrollY - 12, width: 390, height: row.bottom - section.top + 24 };
    });
    await save('phone-calendar', page, r);
    await ctx.close();
  },
};

for (const [name, run] of Object.entries(jobs)) {
  if (wanted && !wanted.has(name)) continue;
  await run();
}
await browser.close();
