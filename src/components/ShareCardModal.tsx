import { useState } from 'react';
import { Copy, Download, Share2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { TradingStats } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import {
  SHARE_SITE_URL,
  buildShareSvg,
  buildShareText,
  downloadSharePng,
  formatSharePeriodLabel,
  formatShareStats,
  resolveShareCardOrientation,
  resolveShareUsername,
  shareDownloadSlug,
  type ShareCardOrientation,
  type SharePeriod,
} from '../utils/shareCard';

const PERIOD_BADGE: Record<SharePeriod, string> = {
  day: 'Trading session',
  month: 'Monthly recap',
  year: 'Year in review',
};

const MODAL_TITLE: Record<SharePeriod, string> = {
  day: 'Share your session',
  month: 'Share your month',
  year: 'Share your year',
};

interface ShareCardModalProps {
  period: SharePeriod;
  stats: TradingStats;
  dateKey?: string;
  year: number;
  month?: number;
  onClose: () => void;
}

export function ShareCardModal({ period, stats, dateKey = '', year, month = 0, onClose }: ShareCardModalProps) {
  const { settings } = useSettings();
  const { user, username: profileUsername } = useAuth();
  const [copied, setCopied] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const isMobileViewport = useMediaQuery('(max-width: 767px)');
  const orientation: ShareCardOrientation = resolveShareCardOrientation(isMobileViewport);

  const username = resolveShareUsername(user, profileUsername);
  const periodLabel = formatSharePeriodLabel(period, dateKey, year, month);
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const pnlStr = fmt(stats.netPnl);
  const sign = stats.netPnl >= 0 ? '+' : '';
  const formatted = formatShareStats(stats);
  const isProfit = stats.netPnl >= 0;

  const shareText = buildShareText(period, periodLabel, username, stats, pnlStr);

  const downloadImage = async () => {
    const svg = buildShareSvg(
      {
        period,
        periodLabel,
        username,
        pnlStr,
        sign,
        winRate: formatted.winRate,
        trades: formatted.trades,
        profitFactor: formatted.profitFactor,
        isProfit,
      },
      orientation,
    );
    const result = await downloadSharePng(
      svg,
      `trend-chasers-${shareDownloadSlug(period, dateKey, year, month)}.png`,
      orientation,
    );

    if (result === 'shared') {
      setSaveHint('Choose Save Image to add it to your Photos.');
      setTimeout(() => setSaveHint(null), 5000);
    } else if (result === 'downloaded') {
      setSaveHint('Image downloaded.');
      setTimeout(() => setSaveHint(null), 3000);
    }
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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-backdrop-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`bg-bg-secondary border border-border rounded-2xl p-5 md:p-6 w-full shadow-xl animate-scale-in my-auto ${
          orientation === 'portrait' ? 'max-w-sm' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">{MODAL_TITLE[period]}</h3>
            {orientation === 'portrait' && (
              <p className="text-[11px] text-text-secondary mt-0.5">Story format for phone</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary focus-ring rounded" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <ShareCardPreview
          period={period}
          periodLabel={periodLabel}
          username={username}
          pnlStr={pnlStr}
          sign={sign}
          isProfit={isProfit}
          winRate={formatted.winRate}
          trades={formatted.trades}
          profitFactor={formatted.profitFactor}
          orientation={orientation}
        />

        <div className="grid grid-cols-3 gap-2 mt-4">
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
            {isMobileViewport ? 'Save photo' : 'PNG'}
          </button>
        </div>
        {saveHint && <p className="text-[11px] text-emerald-300 text-center mt-3">{saveHint}</p>}
      </div>
    </div>
  );
}

interface ShareCardPreviewProps {
  period: SharePeriod;
  periodLabel: string;
  username: string;
  pnlStr: string;
  sign: string;
  isProfit: boolean;
  winRate: string;
  trades: string;
  profitFactor: string;
  orientation: ShareCardOrientation;
}

function ShareCardPreview({
  period,
  periodLabel,
  username,
  pnlStr,
  sign,
  isProfit,
  winRate,
  trades,
  profitFactor,
  orientation,
}: ShareCardPreviewProps) {
  const shellClass =
    'overflow-hidden border-2 border-emerald-500/25 bg-gradient-to-b from-[#111827] via-[#0a0f18] to-[#07090f] shadow-lg shadow-black/30';

  if (orientation === 'portrait') {
    return (
      <div className={`${shellClass} rounded-[2rem] max-w-[280px] mx-auto`}>
        <div className="px-5 pt-6 pb-4 text-center border-b border-white/5">
          <img src="/logo-mark.svg" alt="" aria-hidden className="w-12 h-12 mx-auto mb-3" />
          <p className="text-xs font-black tracking-[0.12em] text-[#6cd59f]">TREND CHASERS</p>
          <p className="text-[10px] text-[#8e939d] mt-1">Track · Analyze · Improve</p>
          <p className="text-xs font-semibold text-emerald-300 mt-3">@{username}</p>
        </div>

        <div className="px-5 py-5 text-center">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 mb-3">
            {PERIOD_BADGE[period]}
          </span>
          <p className="text-xs text-text-secondary uppercase tracking-widest mb-2">{periodLabel}</p>
          <p className={`text-4xl font-extrabold ${isProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {sign}
            {pnlStr}
          </p>

          <div className="space-y-2.5 mt-6">
            {[
              { label: 'Win rate', value: winRate },
              { label: 'Trades', value: trades },
              { label: 'Profit factor', value: profitFactor },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/40 bg-white/[0.03] px-4 py-3"
              >
                <p className="text-[10px] text-text-secondary uppercase tracking-wide">{stat.label}</p>
                <p className="text-lg font-bold mt-0.5">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-border/30">
            <img src="/logo-mark.svg" alt="" aria-hidden className="w-5 h-5 shrink-0" />
            <span className="text-xs text-text-secondary">{SHARE_SITE_URL}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shellClass} rounded-[1.75rem]`}>
      <div className="p-4 md:p-5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo-mark.svg" alt="" aria-hidden className="w-10 h-10 shrink-0" />
            <div className="min-w-0 leading-none">
              <p className="text-xs font-black tracking-[0.12em] text-[#6cd59f]">TREND</p>
              <p className="text-xs font-black tracking-[0.12em] text-text-primary">CHASERS</p>
              <p className="text-[10px] text-[#8e939d] mt-1">Track · Analyze · Improve</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-300 shrink-0">@{username}</span>
        </div>
      </div>

      <div className="p-4 md:p-5">
        <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 mb-3">
          {PERIOD_BADGE[period]}
        </span>
        <p className="text-xs text-text-secondary uppercase tracking-widest mb-1">{periodLabel}</p>
        <p className={`text-3xl md:text-4xl font-extrabold ${isProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
          {sign}
          {pnlStr}
        </p>

        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border/40">
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wide">Win rate</p>
            <p className="text-sm font-bold">{winRate}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wide">Trades</p>
            <p className="text-sm font-bold">{trades}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wide">Profit factor</p>
            <p className="text-sm font-bold">{profitFactor}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 pt-3 border-t border-border/30">
          <img src="/logo-mark.svg" alt="" aria-hidden className="w-5 h-5 shrink-0" />
          <span className="text-xs text-text-secondary">{SHARE_SITE_URL}</span>
        </div>
      </div>
    </div>
  );
}
