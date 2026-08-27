import type { User } from 'firebase/auth';
import type { TradingStats } from './stats';

import { SITE_DOMAIN, SITE_ORIGIN } from '../config/site';

export type SharePeriod = 'day' | 'month' | 'year';
export type ShareCardOrientation = 'landscape' | 'portrait';

export const SHARE_SITE_URL = SITE_DOMAIN;

export function getShareCardDimensions(orientation: ShareCardOrientation): { width: number; height: number } {
  return orientation === 'portrait' ? { width: 450, height: 800 } : { width: 600, height: 400 };
}

export function resolveShareCardOrientation(isMobileViewport: boolean): ShareCardOrientation {
  return isMobileViewport ? 'portrait' : 'landscape';
}

// Standalone raster mark (public/share-mark.png) referenced by absolute URL rather than inlined —
// this SVG gets rasterized through an <img>/<canvas> round-trip (see renderSharePngBlob below), so
// keeping the mark as a same-origin image request avoids bloating the JS bundle with a base64 copy
// on every page load just for a feature most visitors never use.
const SHARE_LOGO_MARK = `<image href="${SITE_ORIGIN}/share-mark.png" x="38" y="36" width="46" height="44"/>`;

const SHARE_LOGO_MARK_SMALL = `<image href="${SITE_ORIGIN}/share-mark.png" x="38" y="337" width="24" height="23"/>`;

// Soft nebula glow behind the mark + a faint hand-placed constellation field, echoing the misty,
// interconnected-node look of the brand's wider marketing art — kept subtle and masked to fade out
// before the stat rows so it never competes with the actual numbers.
const STARFIELD_DEFS = `<radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#34d399" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="starFadeLandscape" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="52%" stop-color="#fff" stop-opacity="0.4"/>
      <stop offset="78%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="starFadePortrait" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="42%" stop-color="#fff" stop-opacity="0.4"/>
      <stop offset="62%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="starMaskLandscape"><rect width="600" height="400" fill="url(#starFadeLandscape)"/></mask>
    <mask id="starMaskPortrait"><rect width="450" height="800" fill="url(#starFadePortrait)"/></mask>`;

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

function starfieldMarkup(
  dots: Array<[number, number, number, number]>,
  lines: Array<[number, number, number, number]>,
): string {
  const dotEls = dots
    .map(([cx, cy, r, o]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#a7f3d0" fill-opacity="${o}"/>`)
    .join('');
  const lineEls = lines
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#34d399" stroke-width="0.6" stroke-opacity="0.2"/>`)
    .join('');
  return lineEls + dotEls;
}

const STARFIELD_LANDSCAPE = starfieldMarkup(STARFIELD_DOTS_LANDSCAPE, STARFIELD_LINES_LANDSCAPE);
const STARFIELD_PORTRAIT = starfieldMarkup(STARFIELD_DOTS_PORTRAIT, STARFIELD_LINES_PORTRAIT);

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

export function buildShareSvg(data: ShareSvgInput, orientation: ShareCardOrientation = 'landscape'): string {
  if (orientation === 'portrait') return buildShareSvgPortrait(data);
  return buildShareSvgLandscape(data);
}

function buildShareSvgLandscape(data: ShareSvgInput): string {
  const pnlColor = data.isProfit ? '#34d399' : '#f87171';
  const badge = PERIOD_BADGE[data.period];
  const badgeWidth = data.period === 'day' ? 168 : data.period === 'month' ? 148 : 152;
  const username = escapeXml(data.username);
  const periodLabel = escapeXml(data.periodLabel.toUpperCase());
  const pnlDisplay = escapeXml(`${data.sign}${data.pnlStr}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="55%" stop-color="#0a0f18"/>
      <stop offset="100%" stop-color="#07090f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.15"/>
    </linearGradient>
    <filter id="pnlGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ${STARFIELD_DEFS}
  </defs>

  <rect width="600" height="400" rx="32" fill="url(#bg)"/>
  <circle cx="70" cy="55" r="130" fill="url(#glow1)"/>
  <circle cx="540" cy="30" r="140" fill="url(#glow2)"/>
  <g mask="url(#starMaskLandscape)">${STARFIELD_LANDSCAPE}</g>
  <rect x="1" y="1" width="598" height="398" rx="31" fill="none" stroke="url(#accent)" stroke-width="2"/>
  <rect x="24" y="24" width="552" height="72" rx="20" fill="rgba(15,20,31,0.65)" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>

  ${SHARE_LOGO_MARK}
  <text x="92" y="52" fill="#6cd59f" font-family="Montserrat, system-ui, sans-serif" font-size="14" font-weight="900" letter-spacing="1.5">TREND</text>
  <text x="92" y="68" fill="#f8fafc" font-family="Montserrat, system-ui, sans-serif" font-size="14" font-weight="900" letter-spacing="1.5">CHASERS</text>
  <text x="92" y="82" fill="#8e939d" font-family="system-ui, sans-serif" font-size="10">Track · Analyze · Improve</text>
  <text x="552" y="62" fill="#6ee7b7" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="600" text-anchor="end">@${username}</text>

  <rect x="40" y="118" width="${badgeWidth}" height="26" rx="13" fill="rgba(52,211,153,0.12)" stroke="rgba(52,211,153,0.35)" stroke-width="1"/>
  <text x="54" y="136" fill="#6ee7b7" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="700" letter-spacing="1.2">${badge}</text>
  <text x="40" y="168" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="600" letter-spacing="1.5">${periodLabel}</text>

  <text x="40" y="238" fill="${pnlColor}" font-family="system-ui,-apple-system,sans-serif" font-size="52" font-weight="800" filter="url(#pnlGlow)">${pnlDisplay}</text>

  <line x1="40" y1="262" x2="560" y2="262" stroke="rgba(148,163,184,0.18)" stroke-width="1"/>

  <text x="40" y="296" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1">WIN RATE</text>
  <text x="40" y="322" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700">${escapeXml(data.winRate)}</text>

  <text x="220" y="296" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1">TRADES</text>
  <text x="220" y="322" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700">${escapeXml(data.trades)}</text>

  <text x="400" y="296" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1">PROFIT FACTOR</text>
  <text x="400" y="322" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700">${escapeXml(data.profitFactor)}</text>

  ${SHARE_LOGO_MARK_SMALL}
  <text x="70" y="367" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500">${SHARE_SITE_URL}</text>
</svg>`;
}

function buildShareSvgPortrait(data: ShareSvgInput): string {
  const pnlColor = data.isProfit ? '#34d399' : '#f87171';
  const badge = PERIOD_BADGE[data.period];
  const badgeWidth = data.period === 'day' ? 168 : data.period === 'month' ? 148 : 152;
  const username = escapeXml(data.username);
  const periodLabel = escapeXml(data.periodLabel.toUpperCase());
  const pnlDisplay = escapeXml(`${data.sign}${data.pnlStr}`);
  const badgeX = (450 - badgeWidth) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="800" viewBox="0 0 450 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="55%" stop-color="#0a0f18"/>
      <stop offset="100%" stop-color="#07090f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.15"/>
    </linearGradient>
    <filter id="pnlGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ${STARFIELD_DEFS}
  </defs>

  <rect width="450" height="800" rx="40" fill="url(#bg)"/>
  <circle cx="225" cy="55" r="150" fill="url(#glow1)"/>
  <circle cx="380" cy="110" r="130" fill="url(#glow2)"/>
  <g mask="url(#starMaskPortrait)">${STARFIELD_PORTRAIT}</g>
  <rect x="1" y="1" width="448" height="798" rx="39" fill="none" stroke="url(#accent)" stroke-width="2"/>

  <image href="${SITE_ORIGIN}/share-mark.png" x="196" y="24" width="58" height="56"/>
  <text x="225" y="118" fill="#6cd59f" font-family="Montserrat, system-ui, sans-serif" font-size="15" font-weight="900" letter-spacing="1.5" text-anchor="middle">TREND CHASERS</text>
  <text x="225" y="138" fill="#8e939d" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">Track · Analyze · Improve</text>
  <text x="225" y="168" fill="#6ee7b7" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="600" text-anchor="middle">@${username}</text>

  <rect x="${badgeX}" y="196" width="${badgeWidth}" height="28" rx="14" fill="rgba(52,211,153,0.12)" stroke="rgba(52,211,153,0.35)" stroke-width="1"/>
  <text x="225" y="215" fill="#6ee7b7" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="700" letter-spacing="1.2" text-anchor="middle">${badge}</text>
  <text x="225" y="252" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="12" font-weight="600" letter-spacing="1.2" text-anchor="middle">${periodLabel}</text>

  <text x="225" y="340" fill="${pnlColor}" font-family="system-ui,-apple-system,sans-serif" font-size="58" font-weight="800" text-anchor="middle" filter="url(#pnlGlow)">${pnlDisplay}</text>

  <rect x="40" y="390" width="370" height="72" rx="18" fill="rgba(15,20,31,0.55)" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>
  <text x="225" y="418" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1" text-anchor="middle">WIN RATE</text>
  <text x="225" y="448" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="24" font-weight="700" text-anchor="middle">${escapeXml(data.winRate)}</text>

  <rect x="40" y="478" width="370" height="72" rx="18" fill="rgba(15,20,31,0.55)" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>
  <text x="225" y="506" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1" text-anchor="middle">TRADES</text>
  <text x="225" y="536" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="24" font-weight="700" text-anchor="middle">${escapeXml(data.trades)}</text>

  <rect x="40" y="566" width="370" height="72" rx="18" fill="rgba(15,20,31,0.55)" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>
  <text x="225" y="594" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="1" text-anchor="middle">PROFIT FACTOR</text>
  <text x="225" y="624" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="24" font-weight="700" text-anchor="middle">${escapeXml(data.profitFactor)}</text>

  <line x1="40" y1="680" x2="410" y2="680" stroke="rgba(148,163,184,0.18)" stroke-width="1"/>
  <text x="225" y="720" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="500" text-anchor="middle">${SHARE_SITE_URL}</text>
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
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to render share image'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#07090f';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

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
