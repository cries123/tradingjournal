import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANDING_SHOTS, webpSize, type LandingShot } from './landingShots';

describe('the landing page screenshots', () => {
  it.each(Object.keys(LANDING_SHOTS) as LandingShot[])('%s is the size the page reserves for it', (file) => {
    const size = webpSize(new Uint8Array(readFileSync(`public/landing/${file}`)));
    expect(size).toEqual(LANDING_SHOTS[file]);
  });

  it('ships nothing the page does not show, and stays small', () => {
    const files = readdirSync('public/landing');
    expect(files.sort()).toEqual(Object.keys(LANDING_SHOTS).sort());
    for (const f of files) {
      // Each loads lazily, but a phone on a slow connection still pays for it.
      expect(readFileSync(`public/landing/${f}`).length, f).toBeLessThan(200_000);
    }
  });

  it('reads a WebP header in each of its three layouts', () => {
    const riff = (chunk: string, body: number[]) => new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...`WEBP${chunk}`].map((c) => c.charCodeAt(0)), body));
    const pad = (n: number) => Array.from({ length: n }, () => 0);
    // VP8X: chunk size (4), flags (4), then width-1 and height-1 as 24-bit numbers.
    expect(webpSize(riff('VP8X', [...pad(8), 0x1f, 0x03, 0x00, 0x57, 0x02, 0x00]))).toEqual({ width: 800, height: 600 });
    // VP8: chunk size (4), frame tag (3), start code (3), then 14-bit width and height.
    expect(webpSize(riff('VP8 ', [...pad(4), ...pad(3), 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02, ...pad(4)]))).toEqual({ width: 800, height: 600 });
    // VP8L: chunk size (4), signature 0x2f, then width-1 (14 bits) and height-1 (14 bits) packed.
    const w = 799;
    const h = 599;
    const packed = w | (h << 14);
    expect(webpSize(riff('VP8L', [...pad(4), 0x2f, packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >> 24) & 0xff, ...pad(8)]))).toEqual({ width: 800, height: 600 });
    expect(webpSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
