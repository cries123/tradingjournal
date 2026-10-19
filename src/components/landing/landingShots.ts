/**
 * The screenshots of the app the landing page shows, in public/landing/, with their pixel sizes.
 *
 * Rendered at 2x from the real components on the page's sample journal (landingStory.ts) — see
 * "Screenshotting the app without running it" in CLAUDE.md for the method. The sizes are here so every
 * <img> can reserve its space before it arrives; landingShots.test.ts reads each file's own header and
 * fails if a re-rendered image no longer matches, which is how a stale size would otherwise only show
 * up as the page jumping.
 */
export const LANDING_SHOTS = {
  'shot-performance.webp': { width: 2400, height: 550 },
  'shot-ask.webp': { width: 1256, height: 1602 },
  'shot-day.webp': { width: 1708, height: 620 },
  'shot-calendar.webp': { width: 1688, height: 924 },
  'shot-trade.webp': { width: 792, height: 1218 },
  'phone-overview.webp': { width: 780, height: 1600 },
  'phone-performance.webp': { width: 780, height: 1600 },
  'phone-ask.webp': { width: 780, height: 1578 },
  'phone-day.webp': { width: 780, height: 1294 },
  'phone-calendar.webp': { width: 780, height: 738 },
} as const;

export type LandingShot = keyof typeof LANDING_SHOTS;

/** The `src`, `width` and `height` for an <img> of one of them. */
export function shot(file: LandingShot): { src: string; width: number; height: number } {
  return { src: `/landing/${file}`, ...LANDING_SHOTS[file] };
}

/**
 * A WebP file's pixel size, from its header.
 *
 * Three layouts: VP8X (extended: 24-bit width-1 and height-1 at bytes 24 and 27), VP8L (lossless:
 * 14-bit width-1 and height-1 packed after a signature byte) and VP8 (lossy: 14-bit sizes after a
 * start code). Null for anything that is not a WebP.
 */
export function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  const ascii = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (bytes.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;
  const chunk = ascii(12, 4);
  const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
  if (chunk === 'VP8X') return { width: u24(24) + 1, height: u24(27) + 1 };
  if (chunk === 'VP8L') {
    const b = (i: number) => bytes[21 + i];
    return { width: 1 + (b(0) | ((b(1) & 0x3f) << 8)), height: 1 + ((b(1) >> 6) | (b(2) << 2) | ((b(3) & 0x0f) << 10)) };
  }
  if (chunk === 'VP8 ') {
    const u16 = (at: number) => bytes[at] | (bytes[at + 1] << 8);
    return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
  }
  return null;
}
