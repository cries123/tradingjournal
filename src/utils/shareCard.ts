import type { User } from 'firebase/auth';
import type { TradingStats } from './stats';

import { SITE_DOMAIN } from '../config/site';

export type SharePeriod = 'day' | 'month' | 'year';
export type ShareCardOrientation = 'landscape' | 'portrait';

export const SHARE_SITE_URL = SITE_DOMAIN;

export function getShareCardDimensions(orientation: ShareCardOrientation): { width: number; height: number } {
  return orientation === 'portrait' ? { width: 450, height: 800 } : { width: 600, height: 400 };
}

/**
 * How much bigger the exported PNG is than the card's layout coordinates.
 *
 * The card was previously written out at its design size — 450x800 — which is a fraction of what
 * anything displays it at. A story slot is 1080x1920, so a 450-wide export was being blown up
 * 2.4x by Instagram before anyone even saw it, and on a 3x phone screen it was soft in the photo
 * roll too. That upscaling is what read as "pixelated"; nothing was wrong with the card itself.
 *
 * Portrait targets 1080x1920 exactly so a story does no resampling at all. Landscape goes to
 * 1800x1200, comfortably above what any timeline renders it at.
 *
 * The card is vector, so this costs nothing in quality. The one raster asset is the logo mark
 * (240x230), drawn at 58 units wide — 139px at 2.4x — so it stays well inside its native
 * resolution and doesn't become the new soft spot.
 */
export function getShareExportScale(orientation: ShareCardOrientation): number {
  return orientation === 'portrait' ? 2.4 : 3;
}

/**
 * Rewrites the root <svg> element's width/height to the target pixel size, leaving viewBox alone
 * so every coordinate in the card still means the same thing.
 *
 * Needed because a browser rasterizes an SVG loaded into an <img> at its *intrinsic* size, and
 * only some engines re-rasterize the vector when drawImage scales it up. Chromium happens to
 * (measured: an upscaled draw and a natively-sized one came out equally sharp), but Safari — the
 * browser most of this feature's users are on — is not reliable about it. Setting the intrinsic
 * size explicitly means the vector is rasterized at full resolution everywhere rather than
 * depending on that.
 */
function withSvgPixelSize(svg: string, width: number, height: number): string {
  return svg.replace(
    /^(\s*<svg\b[^>]*?)\swidth="[\d.]+"\s+height="[\d.]+"/,
    `$1 width="${width}" height="${height}"`,
  );
}

export function resolveShareCardOrientation(isMobileViewport: boolean): ShareCardOrientation {
  return isMobileViewport ? 'portrait' : 'landscape';
}

export const SHARE_MARK_PATH = '/share-mark.png';

/**
 * Where the logo mark comes from, per render target.
 *
 * The live preview inlines its SVG into the DOM, where a root-relative href resolves against the
 * page and loads fine. The PNG export does NOT: it serialises the SVG to a Blob and loads it via
 * `new Image()`, and a relative href inside a document loaded from a `blob:` URL has no usable
 * base to resolve against, so the request never happens and the logo silently vanishes from the
 * downloaded image. Measured in a real browser through the exact export pipeline — relative href
 * drew 0 pixels, a data URI drew the mark correctly.
 *
 * So the export path must pass a data URI (see resolveShareMarkDataUri). The relative default is
 * only ever used by the preview.
 */
function shareLogoMark(href: string): string {
  return `<image href="${href}" x="38" y="36" width="46" height="44"/>`;
}

function shareLogoMarkSmall(href: string): string {
  return `<image href="${href}" x="38" y="337" width="24" height="23"/>`;
}

/** The two accent colors that drive the card's nebula glow, badge and username — mirrors how
 *  Starfield.tsx reads --color-profit-bright / --color-accent so the share card matches whichever
 *  theme accent (Emerald/Cyan/Violet) the user has picked, instead of always being green. The
 *  "TREND CHASERS" wordmark itself stays fixed brand emerald regardless — same brand-locked
 *  reasoning as the logo on the public landing page. */
export interface ShareCardAccent {
  primary: string;
  secondary: string;
}

export const DEFAULT_SHARE_ACCENT: ShareCardAccent = { primary: '#34d399', secondary: '#22d3ee' };

/** Reads the live theme accent the same way Starfield.tsx does. Falls back to the fixed default
 *  when called outside a browser (SSR/prerender) or before the theme vars are set. */
export function resolveShareCardAccent(): ShareCardAccent {
  if (typeof document === 'undefined') return DEFAULT_SHARE_ACCENT;
  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue('--color-profit-bright').trim() || DEFAULT_SHARE_ACCENT.primary;
  const secondary = styles.getPropertyValue('--color-accent').trim() || DEFAULT_SHARE_ACCENT.secondary;
  return { primary, secondary };
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(52,211,153,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Masks that fade the starfield out before the stat rows so it never competes with the actual
// numbers, plus the card's rounded-corner clip-paths — used both to crop a custom background
// image and, wrapped around each builder's whole <g>, to clip everything (glow, starfield, text)
// to the same rounded silhouette so nothing bleeds into the corners. The PNG export leaves those
// corners transparent rather than filling them (see renderSharePngBlob) — that's the only way to
// get an actually-rounded downloaded image rather than a rounded shape painted on a solid square.
const STARFIELD_DEFS = `<linearGradient id="starFadeLandscape" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="58%" stop-color="#fff" stop-opacity="0.65"/>
      <stop offset="85%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="starFadePortrait" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="48%" stop-color="#fff" stop-opacity="0.65"/>
      <stop offset="68%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="starMaskLandscape"><rect width="600" height="400" fill="url(#starFadeLandscape)"/></mask>
    <mask id="starMaskPortrait"><rect width="450" height="800" fill="url(#starFadePortrait)"/></mask>
    <clipPath id="cardClipLandscape"><rect width="600" height="400" rx="32"/></clipPath>
    <clipPath id="cardClipPortrait"><rect width="450" height="800" rx="40"/></clipPath>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#07090f" stop-opacity="0.62"/>
      <stop offset="46%" stop-color="#07090f" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#07090f" stop-opacity="0.8"/>
    </linearGradient>`;

/** Per-accent nebula glow gradients — regenerated with the resolved accent colors rather than
 *  baked into the static defs above, since those change per user/theme. */
function accentGlowDefs(accent: ShareCardAccent): string {
  return `<radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent.primary}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${accent.primary}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent.secondary}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${accent.secondary}" stop-opacity="0"/>
    </radialGradient>`;
}

const STARFIELD_LINES_LANDSCAPE: Array<[number, number, number, number]> = [
  [60, 20, 140, 15], [140, 15, 200, 45], [200, 45, 280, 18], [340, 50, 420, 22],
  [420, 22, 480, 60], [480, 60, 540, 15], [30, 90, 110, 110], [110, 110, 170, 70],
  [250, 100, 330, 90], [330, 90, 400, 110], [400, 110, 460, 95], [460, 95, 520, 120],
  [70, 150, 150, 170], [150, 170, 230, 155],
];

const STARFIELD_DOTS_LANDSCAPE: Array<[number, number, number, number]> = [
  [60, 20, 1.2, 0.5], [140, 15, 0.9, 0.35], [200, 45, 1.4, 0.45], [280, 18, 1, 0.3],
  [340, 50, 1.1, 0.4], [420, 22, 1.3, 0.5], [480, 60, 0.9, 0.3], [540, 15, 1.2, 0.45],
  [580, 80, 1, 0.35], [30, 90, 1, 0.3], [110, 110, 1.3, 0.4], [170, 70, 0.8, 0.25],
  [250, 100, 1.1, 0.35], [330, 90, 0.9, 0.3], [400, 110, 1.2, 0.4], [460, 95, 1, 0.3],
  [520, 120, 0.9, 0.25], [70, 150, 0.8, 0.2], [150, 170, 1, 0.25], [230, 155, 0.9, 0.2],
  [310, 175, 0.8, 0.18], [390, 160, 1, 0.22], [460, 180, 0.8, 0.18], [520, 200, 0.7, 0.15],
  [200, 210, 0.7, 0.15], [350, 220, 0.6, 0.12],
];

const STARFIELD_LINES_PORTRAIT: Array<[number, number, number, number]> = [
  [40, 20, 100, 15], [100, 15, 160, 45], [230, 18, 300, 50], [300, 50, 370, 25],
  [370, 25, 410, 70], [30, 90, 90, 110], [90, 110, 150, 75], [220, 100, 290, 90],
  [290, 90, 350, 115], [350, 115, 410, 100], [60, 150, 130, 175], [130, 175, 200, 155],
];

const STARFIELD_DOTS_PORTRAIT: Array<[number, number, number, number]> = [
  [40, 20, 1.2, 0.5], [100, 15, 0.9, 0.35], [160, 45, 1.3, 0.45], [230, 18, 1, 0.3],
  [300, 50, 1.1, 0.4], [370, 25, 1.2, 0.45], [410, 70, 0.9, 0.3], [30, 90, 1, 0.3],
  [90, 110, 1.2, 0.4], [150, 75, 0.8, 0.25], [220, 100, 1, 0.35], [290, 90, 0.9, 0.3],
  [350, 115, 1.1, 0.35], [410, 100, 0.8, 0.25], [60, 150, 0.8, 0.2], [130, 175, 1, 0.25],
  [200, 155, 0.8, 0.2], [270, 180, 0.8, 0.18], [340, 165, 0.9, 0.2], [400, 190, 0.7, 0.15],
  [90, 230, 0.7, 0.15], [180, 250, 0.6, 0.12], [260, 240, 0.7, 0.15], [340, 260, 0.6, 0.1],
  [400, 280, 0.6, 0.1],
];

// Neutral star/line color (not accent-tinted) — mirrors Starfield.tsx, where the accent only
// drives the nebula glow and the stars themselves stay a plain light slate. Opacity is boosted
// ~1.5x over each dot's base value so the field reads richer ("pop") without changing its layout.
function starfieldMarkup(
  dots: Array<[number, number, number, number]>,
  lines: Array<[number, number, number, number]>,
): string {
  const dotEls = dots
    .map(([cx, cy, r, o]) => `<circle cx="${cx}" cy="${cy}" r="${(r * 1.25).toFixed(2)}" fill="#f8fafc" fill-opacity="${Math.min(0.98, o * 2.3).toFixed(2)}"/>`)
    .join('');
  const lineEls = lines
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#a5c9ff" stroke-width="0.9" stroke-opacity="0.42"/>`)
    .join('');
  return lineEls + dotEls;
}

const STARFIELD_LANDSCAPE = starfieldMarkup(STARFIELD_DOTS_LANDSCAPE, STARFIELD_LINES_LANDSCAPE);
const STARFIELD_PORTRAIT = starfieldMarkup(STARFIELD_DOTS_PORTRAIT, STARFIELD_LINES_PORTRAIT);

/**
 * The card's background layer only — the Milky Way gradient/glow/starfield, or (when
 * backgroundImageHref is set) a user's custom image with a legibility scrim over it. Shared
 * between the exported SVG (buildShareSvgLandscape/Portrait, below) and the live in-modal preview
 * (ShareCardModal.tsx) so the two never drift apart.
 *
 * backgroundImageHref is taken as-is: the live preview passes a plain Storage download URL
 * (fine — the browser is only ever displaying it, not reading its pixels), while the PNG export
 * path must pre-resolve it to a base64 data URI first (see resolveBackgroundImageDataUri) to
 * avoid tainting the export canvas with a cross-origin image.
 */
function backgroundLayer(orientation: ShareCardOrientation, backgroundImageHref?: string | null): string {
  const { width, height } = getShareCardDimensions(orientation);

  if (backgroundImageHref) {
    const clip = orientation === 'portrait' ? 'cardClipPortrait' : 'cardClipLandscape';
    return `<rect width="${width}" height="${height}" fill="#07090f"/>
  <image href="${escapeXml(backgroundImageHref)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>
  <rect width="${width}" height="${height}" fill="url(#scrim)"/>`;
  }

  const mask = orientation === 'portrait' ? 'starMaskPortrait' : 'starMaskLandscape';
  const starfield = orientation === 'portrait' ? STARFIELD_PORTRAIT : STARFIELD_LANDSCAPE;
  const [glow1, glow2] =
    orientation === 'portrait'
      ? [
          { cx: 225, cy: 55, r: 175 },
          { cx: 380, cy: 110, r: 155 },
        ]
      : [
          { cx: 70, cy: 55, r: 155 },
          { cx: 540, cy: 35, r: 165 },
        ];

  return `<rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${glow1.cx}" cy="${glow1.cy}" r="${glow1.r}" fill="url(#glow1)"/>
  <circle cx="${glow2.cx}" cy="${glow2.cy}" r="${glow2.r}" fill="url(#glow2)"/>
  <g mask="url(#${mask})">${starfield}</g>`;
}

/**
 * A standalone, self-contained `<svg>` of just the background layer (gradient/glow/starfield or
 * custom image), sized to fill its container via viewBox + preserveAspectRatio="xMidYMid slice".
 * Used by ShareCardPreview via dangerouslySetInnerHTML so the live preview's background is pixel-
 * for-pixel the same recipe as the exported PNG, not a hand-maintained CSS approximation of it.
 */
export function buildSharePreviewBackground(
  orientation: ShareCardOrientation,
  accent: ShareCardAccent,
  backgroundImageHref?: string | null,
): string {
  const { width, height } = getShareCardDimensions(orientation);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
  <defs>${STARFIELD_DEFS}${accentGlowDefs(accent)}</defs>
  ${backgroundLayer(orientation, backgroundImageHref)}
</svg>`;
}

/**
 * Fetches a share-card background (a Firebase Storage download URL) and inlines it as a base64
 * data URI, so buildShareSvg can embed it directly in the exported SVG rather than referencing
 * the Storage URL — a cross-origin `<image href="https://...">` would taint the export canvas and
 * silently break `canvas.toBlob()`. Returns null (falling back to the default Milky Way
 * background) if the URL is empty or the fetch fails for any reason — a broken custom background
 * should never be the reason someone can't export their share card.
 */
export async function resolveBackgroundImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read background image'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

let markDataUriPromise: Promise<string | null> | null = null;

/**
 * Loads the logo mark as a base64 data URI for the PNG export.
 *
 * Cached for the session: the file is a few KB and never changes, and the export is usually
 * triggered more than once. Returns null on failure so the caller can fall back to the relative
 * path — a card with no logo still beats a card that won't export at all.
 */
export function resolveShareMarkDataUri(): Promise<string | null> {
  if (markDataUriPromise) return markDataUriPromise;

  markDataUriPromise = (async () => {
    try {
      const res = await fetch(SHARE_MARK_PATH);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read logo mark'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();

  return markDataUriPromise;
}

const PERIOD_BADGE: Record<SharePeriod, string> = {
  day: 'TRADING SESSION',
  month: 'MONTHLY RECAP',
  year: 'YEAR IN REVIEW',
};

export function resolveShareUsername(user: User | null, profileUsername?: string | null): string {
  if (profileUsername?.trim()) return profileUsername.trim();
  if (!user) return 'Trader';
  const email = user.email?.trim();
  if (email) return email.split('@')[0] ?? 'Trader';
  return 'Trader';
}

export function formatSharePeriodLabel(period: SharePeriod, dateKey: string, year: number, month: number): string {
  if (period === 'day') {
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  if (period === 'month') {
    return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return String(year);
}

export function shareDownloadSlug(period: SharePeriod, dateKey: string, year: number, month: number): string {
  if (period === 'day') return `session-${dateKey}`;
  if (period === 'month') return `month-${year}-${month + 1}`;
  return `year-${year}`;
}

export function buildShareText(
  period: SharePeriod,
  periodLabel: string,
  username: string,
  stats: TradingStats,
  pnlFormatted: string,
): string {
  const sign = stats.netPnl >= 0 ? '+' : '';
  const scope =
    period === 'day' ? 'Session' : period === 'month' ? 'Month' : 'Year';
  const winRate = stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '0%';
  const pf =
    stats.totalTrades > 0
      ? stats.profitFactor >= 99
        ? '∞'
        : stats.profitFactor.toFixed(2)
      : '—';

  return `${periodLabel} · @${username}
${scope} P&L: ${sign}${pnlFormatted}
Win rate: ${winRate}
Trades: ${stats.totalTrades}
Profit factor: ${pf}

Tracked with Trend Chasers · ${SHARE_SITE_URL}`;
}

export interface ShareSvgInput {
  period: SharePeriod;
  periodLabel: string;
  username: string;
  pnlStr: string;
  sign: string;
  winRate: string;
  trades: string;
  profitFactor: string;
  isProfit: boolean;
}

export function buildShareSvg(
  data: ShareSvgInput,
  orientation: ShareCardOrientation = 'landscape',
  accent: ShareCardAccent = DEFAULT_SHARE_ACCENT,
  backgroundImageHref?: string | null,
  /** Data URI for the logo mark. Required for the PNG export — see shareLogoMark. */
  markHref: string = SHARE_MARK_PATH,
): string {
  if (orientation === 'portrait') {
    return buildShareSvgPortrait(data, accent, backgroundImageHref, markHref);
  }
  return buildShareSvgLandscape(data, accent, backgroundImageHref, markHref);
}

function buildShareSvgLandscape(
  data: ShareSvgInput,
  accent: ShareCardAccent,
  backgroundImageHref?: string | null,
  markHref: string = SHARE_MARK_PATH,
): string {
  const pnlColor = data.isProfit ? '#34d399' : '#f87171';
  const badge = PERIOD_BADGE[data.period];
  const badgeWidth = data.period === 'day' ? 168 : data.period === 'month' ? 148 : 152;
  const username = escapeXml(data.username);
  const periodLabel = escapeXml(data.periodLabel.toUpperCase());
  const pnlDisplay = escapeXml(`${data.sign}${data.pnlStr}`);
  const badgeFill = hexToRgba(accent.primary, 0.14);
  const badgeBorder = hexToRgba(accent.primary, 0.4);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="55%" stop-color="#0a0f18"/>
      <stop offset="100%" stop-color="#07090f"/>
    </linearGradient>
    <filter id="pnlGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ${STARFIELD_DEFS}
    ${accentGlowDefs(accent)}
  </defs>

  <g clip-path="url(#cardClipLandscape)">
  ${backgroundLayer('landscape', backgroundImageHref)}
  <rect width="600" height="96" fill="rgba(15,20,31,0.65)"/>
  <line x1="0" y1="96" x2="600" y2="96" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>

  ${shareLogoMark(markHref)}
  <text x="92" y="52" fill="#6cd59f" font-family="Montserrat, system-ui, sans-serif" font-size="14" font-weight="900" letter-spacing="1.5">TREND</text>
  <text x="92" y="68" fill="#f8fafc" font-family="Montserrat, system-ui, sans-serif" font-size="14" font-weight="900" letter-spacing="1.5">CHASERS</text>
  <text x="92" y="82" fill="#8e939d" font-family="system-ui, sans-serif" font-size="10">Track · Analyze · Improve</text>
  <text x="552" y="62" fill="${accent.primary}" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="600" text-anchor="end">@${username}</text>

  <rect x="40" y="118" width="${badgeWidth}" height="26" rx="13" fill="${badgeFill}" stroke="${badgeBorder}" stroke-width="1"/>
  <text x="54" y="136" fill="${accent.primary}" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="700" letter-spacing="1.2">${badge}</text>
  <text x="40" y="168" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="600" letter-spacing="1.5">${periodLabel}</text>

  <text x="40" y="238" fill="${pnlColor}" font-family="system-ui,-apple-system,sans-serif" font-size="52" font-weight="800" filter="url(#pnlGlow)">${pnlDisplay}</text>

  <line x1="40" y1="262" x2="560" y2="262" stroke="rgba(148,163,184,0.18)" stroke-width="1"/>

  <text x="40" y="296" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1">WIN RATE</text>
  <text x="40" y="322" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700">${escapeXml(data.winRate)}</text>

  <text x="220" y="296" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1">TRADES</text>
  <text x="220" y="322" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700">${escapeXml(data.trades)}</text>

  <text x="400" y="296" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1">PROFIT FACTOR</text>
  <text x="400" y="322" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700">${escapeXml(data.profitFactor)}</text>

  ${shareLogoMarkSmall(markHref)}
  <text x="70" y="367" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500">${SHARE_SITE_URL}</text>
  </g>
</svg>`;
}

/** One of the three stat columns on the portrait card. 118 wide with 8px gutters spans 40..410. */
function statColumn(x: number, value: string, label: string, accent: ShareCardAccent): string {
  const centre = x + 59;
  return `<rect x="${x}" y="455" width="118" height="96" rx="16" fill="rgba(15,20,31,0.6)" stroke="${hexToRgba(
    accent.primary,
    0.16,
  )}" stroke-width="1"/>
  <text x="${centre}" y="505" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="700" text-anchor="middle">${value}</text>
  <text x="${centre}" y="529" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" letter-spacing="0.8" text-anchor="middle">${label}</text>`;
}

function buildShareSvgPortrait(
  data: ShareSvgInput,
  accent: ShareCardAccent,
  backgroundImageHref?: string | null,
  markHref: string = SHARE_MARK_PATH,
): string {
  const pnlColor = data.isProfit ? '#34d399' : '#f87171';
  const badge = PERIOD_BADGE[data.period];
  const badgeWidth = data.period === 'day' ? 168 : data.period === 'month' ? 148 : 152;
  const username = escapeXml(data.username);
  const periodLabel = escapeXml(data.periodLabel.toUpperCase());
  const pnlDisplay = escapeXml(`${data.sign}${data.pnlStr}`);
  const badgeX = (450 - badgeWidth) / 2;
  const badgeFill = hexToRgba(accent.primary, 0.14);
  const badgeBorder = hexToRgba(accent.primary, 0.4);
  // Win rate arrives pre-formatted ("45.9%" or "—"), so parse rather than re-deriving it.
  const winPct = Number.parseFloat(data.winRate);
  const winBarWidth = Number.isFinite(winPct) ? Math.max(0, Math.min(100, winPct)) * 3.3 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="800" viewBox="0 0 450 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="55%" stop-color="#0a0f18"/>
      <stop offset="100%" stop-color="#07090f"/>
    </linearGradient>
    <filter id="pnlGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ${STARFIELD_DEFS}
    ${accentGlowDefs(accent)}
  </defs>

  <g clip-path="url(#cardClipPortrait)">
  ${backgroundLayer('portrait', backgroundImageHref)}

  <image href="${markHref}" x="196" y="24" width="58" height="56"/>
  <text x="225" y="118" fill="#6cd59f" font-family="Montserrat, system-ui, sans-serif" font-size="15" font-weight="900" letter-spacing="1.5" text-anchor="middle">TREND CHASERS</text>
  <text x="225" y="138" fill="#8e939d" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">Track · Analyze · Improve</text>
  <text x="225" y="168" fill="${accent.primary}" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="600" text-anchor="middle">@${username}</text>

  <rect x="${badgeX}" y="196" width="${badgeWidth}" height="28" rx="14" fill="${badgeFill}" stroke="${badgeBorder}" stroke-width="1"/>
  <text x="225" y="215" fill="${accent.primary}" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="700" letter-spacing="1.2" text-anchor="middle">${badge}</text>
  <text x="225" y="252" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="12" font-weight="600" letter-spacing="1.2" text-anchor="middle">${periodLabel}</text>

  <text x="225" y="310" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="600" letter-spacing="1.6" text-anchor="middle">NET P&amp;L</text>
  <text x="225" y="375" fill="${pnlColor}" font-family="system-ui,-apple-system,sans-serif" font-size="64" font-weight="800" text-anchor="middle" filter="url(#pnlGlow)">${pnlDisplay}</text>

  <!-- Win/loss split. Three identical numbers in a row say nothing about their relationship;
       this bar shows the shape of the month at a glance before you read a single figure. -->
  <rect x="60" y="415" width="330" height="6" rx="3" fill="rgba(148,163,184,0.14)"/>
  <rect x="60" y="415" width="${winBarWidth}" height="6" rx="3" fill="${pnlColor}" opacity="0.85"/>

  <!-- One row of three, matching the landscape card. Stacked full-width boxes spent 250px of an
       800px card on three short numbers and pushed everything else into dead space. -->
  ${statColumn(40, escapeXml(data.winRate), 'WIN RATE', accent)}
  ${statColumn(166, escapeXml(data.trades), 'TRADES', accent)}
  ${statColumn(292, escapeXml(data.profitFactor), 'PROFIT FACTOR', accent)}

  <line x1="120" y1="622" x2="330" y2="622" stroke="rgba(148,163,184,0.16)" stroke-width="1"/>
  <image href="${markHref}" x="203" y="650" width="44" height="42" opacity="0.85"/>
  <text x="225" y="726" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="600" letter-spacing="0.4" text-anchor="middle">${SHARE_SITE_URL}</text>
  </g>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderSharePngBlob(
  svg: string,
  orientation: ShareCardOrientation = 'landscape',
): Promise<Blob | null> {
  const { width, height } = getShareCardDimensions(orientation);
  const scale = getShareExportScale(orientation);
  const outWidth = Math.round(width * scale);
  const outHeight = Math.round(height * scale);

  const blob = new Blob([withSvgPixelSize(svg, outWidth, outHeight)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to render share image'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';

    // No fallback fill here on purpose: the card itself is a rounded shape clipped inside the
    // SVG (see the cardClipLandscape/cardClipPortrait <g> wrapper in buildShareSvgLandscape /
    // Portrait), so the four corners outside that rounded silhouette are meant to stay fully
    // transparent in the exported PNG — a solid fill would turn "rounded corners" back into a
    // plain rectangle with rounded corners painted over a solid background.
    ctx.drawImage(img, 0, 0, outWidth, outHeight);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((png) => resolve(png), 'image/png', 1);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function prefersGallerySave(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

/** On phone, opens the share sheet so users can tap Save Image → Photos. Desktop downloads a file. */
export async function saveSharePngToGallery(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });

  if (prefersGallerySave() && typeof navigator.share === 'function') {
    const canShareFiles =
      typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });

    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], title: 'Trend Chasers share card' });
        return 'shared';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return 'cancelled';
        }
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export async function downloadSharePng(
  svg: string,
  filename: string,
  orientation: ShareCardOrientation = 'landscape',
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const png = await renderSharePngBlob(svg, orientation);
  if (!png) return 'failed';
  return saveSharePngToGallery(png, filename);
}

export function formatShareStats(stats: TradingStats) {
  return {
    winRate: stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '—',
    trades: String(stats.totalTrades),
    profitFactor:
      stats.totalTrades > 0 ? (stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)) : '—',
  };
}
