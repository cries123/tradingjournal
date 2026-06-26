import { useState } from 'react';
import { Copy, Download, Share2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import type { TradingStats } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import {
  SHARE_SITE_URL,
  buildShareSvg,
  buildShareText,
  downloadSharePng,
  formatSharePeriodLabel,
  formatShareStats,
  resolveShareUsername,
  shareDownloadSlug,
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

  const username = resolveShareUsername(user, profileUsername);
  const periodLabel = formatSharePeriodLabel(period, dateKey, year, month);
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const pnlStr = fmt(stats.netPnl);
  const sign = stats.netPnl >= 0 ? '+' : '';
  const formatted = formatShareStats(stats);
  const isProfit = stats.netPnl >= 0;

  const shareText = buildShareText(period, periodLabel, username, stats, pnlStr);

  const downloadImage = async () => {
    const svg = buildShareSvg({
      period,
      periodLabel,
      username,
      pnlStr,
      sign,
      winRate: formatted.winRate,
      trades: formatted.trades,
      profitFactor: formatted.profitFactor,
      isProfit,
    });
    await downloadSharePng(svg, `trend-chasers-${shareDownloadSlug(period, dateKey, year, month)}.png`);
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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{MODAL_TITLE[period]}</h3>
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
            PNG
          </button>
        </div>
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
}: ShareCardPreviewProps) {
  return (
    <div className="rounded-xl overflow-hidden border border-emerald-500/25 bg-gradient-to-b from-[#111827] via-[#0a0f18] to-[#07090f]">
      <div className="p-4 md:p-5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center font-extrabold text-bg-primary text-sm shrink-0 shadow-lg shadow-emerald-500/25">
              TC
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-text-primary leading-tight">Trend Chasers</p>
              <p className="text-[11px] text-text-secondary mt-0.5">Track · Analyze · Improve</p>
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
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-[8px] font-extrabold text-bg-primary">
            TC
          </div>
          <span className="text-xs text-text-secondary">{SHARE_SITE_URL}</span>
        </div>
      </div>
    </div>
  );
}
