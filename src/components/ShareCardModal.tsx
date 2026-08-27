import { useRef, useState } from 'react';
import { Copy, Download, Plus, Share2, Sparkles, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { MAX_SHARE_CARD_BACKGROUNDS, deleteShareCardBackground, uploadShareCardBackground } from '../services/shareCardBackgrounds';
import type { TradingStats } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import {
  buildSharePreviewBackground,
  buildShareSvg,
  buildShareText,
  downloadSharePng,
  formatSharePeriodLabel,
  formatShareStats,
  hexToRgba,
  resolveBackgroundImageDataUri,
  resolveShareCardAccent,
  resolveShareCardOrientation,
  resolveShareUsername,
  shareDownloadSlug,
  SHARE_SITE_URL,
  type ShareCardAccent,
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
  useEscapeToClose(onClose);
  const { settings, updateSettings } = useSettings();
  const { user, username: profileUsername, firebaseEnabled } = useAuth();
  const [copied, setCopied] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accent] = useState<ShareCardAccent>(() => resolveShareCardAccent());
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
  const selectedBackground = settings.shareCardBackgroundId;

  const handleSelectBackground = (url: string | null) => {
    updateSettings({ shareCardBackgroundId: url });
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadShareCardBackground(user.uid, file);
      const nextList = [...settings.shareCardBackgrounds, url];
      const evicted = nextList.length > MAX_SHARE_CARD_BACKGROUNDS ? nextList.splice(0, nextList.length - MAX_SHARE_CARD_BACKGROUNDS) : [];
      evicted.forEach((u) => void deleteShareCardBackground(u));
      updateSettings({ shareCardBackgrounds: nextList, shareCardBackgroundId: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload that image.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveBackground = (url: string) => {
    const nextList = settings.shareCardBackgrounds.filter((u) => u !== url);
    const nextSelected = settings.shareCardBackgroundId === url ? null : settings.shareCardBackgroundId;
    updateSettings({ shareCardBackgrounds: nextList, shareCardBackgroundId: nextSelected });
    void deleteShareCardBackground(url);
  };

  const downloadImage = async () => {
    setExporting(true);
    try {
      const backgroundHref = await resolveBackgroundImageDataUri(selectedBackground);
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
        accent,
        backgroundHref,
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
    } finally {
      setExporting(false);
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
          accent={accent}
          backgroundImageUrl={selectedBackground}
        />

        {firebaseEnabled && user && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">Card background</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => handleSelectBackground(null)}
                className={`relative shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 focus-ring ${
                  selectedBackground === null ? 'border-accent' : 'border-border/60 hover:border-border'
                }`}
                title="Milky Way (default)"
                aria-label="Use the default Milky Way background"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-[#111827] via-[#0a0f18] to-[#07090f]" />
                <Sparkles size={14} className="absolute inset-0 m-auto text-white/70" />
              </button>

              {settings.shareCardBackgrounds.map((url) => (
                <div key={url} className="relative shrink-0 group">
                  <button
                    type="button"
                    onClick={() => handleSelectBackground(url)}
                    className={`w-12 h-12 rounded-lg overflow-hidden border-2 focus-ring bg-bg-tertiary ${
                      selectedBackground === url ? 'border-accent' : 'border-border/60 hover:border-border'
                    }`}
                    title="Use this background"
                    aria-label="Use this saved background"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveBackground(url)}
                    className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-bg-primary border border-border text-text-secondary hover:text-loss-bright flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus-ring"
                    aria-label="Remove this saved background"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleUploadClick}
                disabled={uploading}
                className="shrink-0 w-12 h-12 rounded-lg border-2 border-dashed border-border/60 hover:border-accent/60 text-text-secondary hover:text-accent flex items-center justify-center focus-ring disabled:opacity-50"
                aria-label="Upload a custom background image"
              >
                {uploading ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFileChosen(e)} />
            </div>
            {uploadError && <p className="text-[11px] text-loss-bright mt-1.5">{uploadError}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mt-4">
          <button type="button" onClick={() => void nativeShare()} className="flex flex-col items-center gap-1 py-3 btn-secondary text-xs">
            <Share2 size={16} />
            Share
          </button>
          <button type="button" onClick={() => void copyText()} className="flex flex-col items-center gap-1 py-3 btn-secondary text-xs">
            <Copy size={16} />
            {copied ? 'Copied!' : 'Copy text'}
          </button>
          <button
            type="button"
            onClick={() => void downloadImage()}
            disabled={exporting}
            className="flex flex-col items-center gap-1 py-3 btn-secondary text-xs disabled:opacity-60"
          >
            <Download size={16} />
            {exporting ? 'Preparing…' : isMobileViewport ? 'Save photo' : 'PNG'}
          </button>
        </div>
        {saveHint && <p className="text-[11px] text-profit-bright text-center mt-3">{saveHint}</p>}
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
  accent: ShareCardAccent;
  backgroundImageUrl: string | null;
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
  accent,
  backgroundImageUrl,
}: ShareCardPreviewProps) {
  // `isolate` matters here, not just decoration: without it, `relative` alone doesn't create a
  // new stacking context, so the background layer's `-z-10` (below) escapes to the nearest
  // ancestor stacking context instead of staying local — which buried it behind the whole modal.
  const shellClass = 'relative isolate overflow-hidden border-[3px] border-black shadow-lg shadow-black/40';
  const usernameStyle = { color: accent.primary };
  const badgeStyle = {
    color: accent.primary,
    backgroundColor: hexToRgba(accent.primary, 0.12),
    borderColor: hexToRgba(accent.primary, 0.35),
  };

  const background = backgroundImageUrl ? (
    <>
      <img src={backgroundImageUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/75" />
    </>
  ) : (
    <div
      className="absolute inset-0"
      // Markup is generated locally by buildSharePreviewBackground (no user input), so this is safe.
      dangerouslySetInnerHTML={{ __html: buildSharePreviewBackground(orientation, accent) }}
    />
  );

  if (orientation === 'portrait') {
    return (
      <div className={`${shellClass} rounded-[2rem] max-w-[280px] mx-auto`}>
        <div className="absolute inset-0 -z-10 overflow-hidden">{background}</div>

        <div className="px-5 pt-6 pb-4 text-center border-b border-white/5">
          <img src="/logo-mark.svg" alt="" aria-hidden className="w-12 h-12 mx-auto mb-3" />
          <p className="text-xs font-black tracking-[0.12em] text-[#6cd59f]">TREND CHASERS</p>
          <p className="text-[10px] text-[#8e939d] mt-1">Track · Analyze · Improve</p>
          <p className="text-xs font-semibold mt-3" style={usernameStyle}>@{username}</p>
        </div>

        <div className="px-5 py-5 text-center">
          <span
            className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border mb-3"
            style={badgeStyle}
          >
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
      <div className="absolute inset-0 -z-10 overflow-hidden">{background}</div>

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
          <span className="text-xs font-semibold shrink-0" style={usernameStyle}>@{username}</span>
        </div>
      </div>

      <div className="p-4 md:p-5">
        <span
          className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border mb-3"
          style={badgeStyle}
        >
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
