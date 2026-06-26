import type { User } from 'firebase/auth';
import type { TradingStats } from './stats';

export type SharePeriod = 'day' | 'month' | 'year';

export const SHARE_SITE_URL = 'Trendchaser.net';

const SHARE_LOGO_MARK = `<g transform="translate(40 40) scale(0.45)">
  <circle cx="44" cy="44" r="36" stroke="#7ED9A4" stroke-width="2" opacity="0.28"/>
  <g fill="#7ED9A4">
    <path d="M44 6 L48 20 L40 20 Z"/>
    <path d="M44 82 L48 68 L40 68 Z"/>
    <path d="M6 44 L20 48 L20 40 Z"/>
    <path d="M82 44 L68 48 L68 40 Z"/>
  </g>
  <path d="M14 58 L24 48 L34 52 L44 38 L54 42 L64 28 L72 20" stroke="#7ED9A4" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M72 20 L63 18 L72 10 Z" fill="#7ED9A4"/>
  <rect x="58" y="12" width="4.5" height="11" rx="1.2" fill="#F87171"/>
  <rect x="64.5" y="8" width="4.5" height="15" rx="1.2" fill="#F87171"/>
  <rect x="71" y="4" width="4.5" height="19" rx="1.2" fill="#F87171"/>
</g>`;

const SHARE_LOGO_MARK_SMALL = `<g transform="translate(40 352) scale(0.25)">
  <circle cx="44" cy="44" r="36" stroke="#7ED9A4" stroke-width="2.5" opacity="0.28"/>
  <g fill="#7ED9A4">
    <path d="M44 6 L48 20 L40 20 Z"/>
    <path d="M44 82 L48 68 L40 68 Z"/>
    <path d="M6 44 L20 48 L20 40 Z"/>
    <path d="M82 44 L68 48 L68 40 Z"/>
  </g>
  <path d="M14 58 L24 48 L34 52 L44 38 L54 42 L64 28 L72 20" stroke="#7ED9A4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M72 20 L63 18 L72 10 Z" fill="#7ED9A4"/>
  <rect x="58" y="12" width="5" height="11" rx="1.2" fill="#F87171"/>
  <rect x="65" y="8" width="5" height="15" rx="1.2" fill="#F87171"/>
  <rect x="72" y="4" width="5" height="19" rx="1.2" fill="#F87171"/>
</g>`;

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

export function buildShareSvg(data: ShareSvgInput): string {
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
    <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#22d3ee"/>
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
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(52,211,153,0.04)" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="600" height="400" rx="20" fill="url(#bg)"/>
  <rect width="600" height="400" rx="20" fill="url(#grid)"/>
  <rect x="1" y="1" width="598" height="398" rx="19" fill="none" stroke="url(#accent)" stroke-width="2"/>
  <rect x="24" y="24" width="552" height="72" rx="14" fill="rgba(15,20,31,0.65)" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>

  ${SHARE_LOGO_MARK}
  <text x="92" y="52" fill="#7ED9A4" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="800" letter-spacing="1.5">TREND</text>
  <text x="92" y="68" fill="#f8fafc" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="800" letter-spacing="1.5">CHASERS</text>
  <text x="92" y="82" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="10">Track · Analyze · Improve</text>
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

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function downloadSharePng(svg: string, filename: string): Promise<void> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to render share image'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(url);
    return;
  }
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, 600, 400);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  await new Promise<void>((resolve) => {
    canvas.toBlob((png) => {
      if (!png) {
        resolve();
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      resolve();
    });
  });
}

export function formatShareStats(stats: TradingStats) {
  return {
    winRate: stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '—',
    trades: String(stats.totalTrades),
    profitFactor:
      stats.totalTrades > 0 ? (stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)) : '—',
  };
}
