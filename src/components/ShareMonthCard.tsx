import { useRef, useState } from 'react';
import { Copy, Download, Share2, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useSettings } from '../context/SettingsContext';
import type { TradingStats } from '../utils/stats';
import { formatCurrency, formatMonthYear } from '../utils/format';

interface ShareMonthCardProps {
  stats: TradingStats;
  year: number;
  month: number;
  journalName: string;
  onClose: () => void;
}

export function ShareMonthCard({ stats, year, month, journalName, onClose }: ShareMonthCardProps) {
  const { settings } = useSettings();
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const monthLabel = formatMonthYear(year, month);
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const pnlStr = fmt(stats.netPnl);
  const sign = stats.netPnl >= 0 ? '+' : '';

  const shareText = `${monthLabel} · ${journalName}\nNet P&L: ${sign}${pnlStr}\nWin rate: ${stats.totalTrades > 0 ? stats.winRate.toFixed(1) : '0'}%\nTrades: ${stats.totalTrades}\n\nTracked with Trend Chasers`;

  const downloadImage = async () => {
    const el = cardRef.current;
    if (!el) return;

    const svg = buildShareSvg({
      monthLabel,
      journalName,
      pnlStr,
      sign,
      winRate: stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '—',
      trades: String(stats.totalTrades),
      profitFactor: stats.totalTrades > 0 ? (stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)) : '—',
      isProfit: stats.netPnl >= 0,
    });

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 340;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#07090f';
      ctx.fillRect(0, 0, 600, 340);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(png);
        a.download = `trend-chasers-${year}-${month + 1}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
    };
    img.src = url;
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Trend Chasers', text: shareText });
      } catch {
        /* cancelled */
      }
    } else {
      void copyText();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-backdrop-in" onClick={onClose}>
      <div className="bg-bg-secondary border border-border rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Share your month</h3>
          <button type="button" onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary focus-ring rounded" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div
          ref={cardRef}
          className="rounded-xl p-5 md:p-6 mb-4 border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-bg-card to-cyan-500/5"
        >
          <div className="flex items-center justify-between mb-4">
            <BrandLogo size="sm" />
            <span className="text-[10px] uppercase tracking-widest text-text-secondary">{journalName}</span>
          </div>
          <p className="text-xs text-text-secondary uppercase tracking-widest mb-1">{monthLabel}</p>
          <p className={`text-3xl md:text-4xl font-bold ${stats.netPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {sign}{pnlStr}
          </p>
          <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border/40">
            <div>
              <p className="text-[10px] text-text-secondary uppercase">Win rate</p>
              <p className="text-sm font-semibold">{stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase">Trades</p>
              <p className="text-sm font-semibold">{stats.totalTrades}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase">Profit factor</p>
              <p className="text-sm font-semibold">{stats.totalTrades > 0 ? (stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)) : '—'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => void nativeShare()} className="flex flex-col items-center gap-1 py-3 btn-secondary text-xs">
            <Share2 size={16} />
            Share
          </button>
          <button type="button" onClick={() => void copyText()} className="flex flex-col items-center gap-1 py-3 btn-secondary text-xs">
            <Copy size={16} />
            {copied ? 'Copied!' : 'Copy text'}
          </button>
          <button type="button" onClick={() => void downloadImage()} className="flex flex-col items-center gap-1 py-3 btn-secondary text-xs">
            <Download size={16} />
            PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function buildShareSvg(data: {
  monthLabel: string;
  journalName: string;
  pnlStr: string;
  sign: string;
  winRate: string;
  trades: string;
  profitFactor: string;
  isProfit: boolean;
}): string {
  const pnlColor = data.isProfit ? '#34d399' : '#f87171';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f141f"/>
      <stop offset="100%" stop-color="#07090f"/>
    </linearGradient>
  </defs>
  <rect width="600" height="340" rx="16" fill="url(#bg)"/>
  <rect x="1" y="1" width="598" height="338" rx="15" fill="none" stroke="rgba(52,211,153,0.3)" stroke-width="2"/>
  <text x="32" y="48" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="13" font-weight="600">TREND CHASERS</text>
  <text x="568" y="48" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="12" text-anchor="end">${escapeXml(data.journalName)}</text>
  <text x="32" y="88" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="13" letter-spacing="2">${escapeXml(data.monthLabel.toUpperCase())}</text>
  <text x="32" y="150" fill="${pnlColor}" font-family="system-ui,sans-serif" font-size="48" font-weight="700">${escapeXml(data.sign + data.pnlStr)}</text>
  <line x1="32" y1="180" x2="568" y2="180" stroke="rgba(148,163,184,0.2)" stroke-width="1"/>
  <text x="32" y="220" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="11">WIN RATE</text>
  <text x="32" y="245" fill="#f1f5f9" font-family="system-ui,sans-serif" font-size="20" font-weight="600">${escapeXml(data.winRate)}</text>
  <text x="220" y="220" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="11">TRADES</text>
  <text x="220" y="245" fill="#f1f5f9" font-family="system-ui,sans-serif" font-size="20" font-weight="600">${escapeXml(data.trades)}</text>
  <text x="408" y="220" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="11">PROFIT FACTOR</text>
  <text x="408" y="245" fill="#f1f5f9" font-family="system-ui,sans-serif" font-size="20" font-weight="600">${escapeXml(data.profitFactor)}</text>
  <text x="32" y="310" fill="#64748b" font-family="system-ui,sans-serif" font-size="12">trendchasers.app</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
