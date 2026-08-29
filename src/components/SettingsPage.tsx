import { useState, useRef } from 'react';
import { ArrowLeft, Copy, Download, EyeOff, FileText, Plus, Share2, Trash2, Trophy, Upload } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import type { CurrencyCode, ThemeAccent } from '../types/settings';
import type { Trade } from '../types';
import { computeStats, type TradingStats } from '../utils/stats';
import { downloadBackup, parseBackup, type ParsedBackup } from '../utils/backup';
import { exportMonthReport, exportTaxCsv, exportTradesCsv } from '../utils/exportTrades';
import { ConfirmDialog } from './ConfirmDialog';
import { coachShareUrl, createTradeHistoryShare, disableCoachShare } from '../services/coachShare';
import { detectWashSales } from '../utils/washSale';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function defaultRangeEnd(): string {
  return toDateStr(new Date());
}
function defaultRangeStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toDateStr(d);
}

interface SettingsPageProps {
  trades: Trade[];
  /** Every trade across all journals — used for full backups. */
  everyTrade: Trade[];
  monthStats: TradingStats;
  year: number;
  month: number;
  onBack: () => void;
  onRestoreTrades: (trades: Trade[]) => Promise<void>;
}

export function SettingsPage({
  trades,
  everyTrade,
  monthStats,
  year,
  month,
  onBack,
  onRestoreTrades,
}: SettingsPageProps) {
  const { settings, updateSettings, addSetupTag, addStrategy, removeStrategy, addAccount, removeAccount, setActiveAccount } = useSettings();
  const { username, user, firebaseEnabled } = useAuth();
  // Leaderboards only ever rank broker-synced trades (see sourceId on Trade) — manual entries
  // can't be faked into a ranking, so opting in requires at least one synced trade to exist first.
  const hasSyncedTrade = everyTrade.some((t) => Boolean(t.sourceId));
  const [newTag, setNewTag] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newStrategy, setNewStrategy] = useState('');
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachMessageIsError, setCoachMessageIsError] = useState(false);
  const [shareStart, setShareStart] = useState(settings.coachShareRangeStart || defaultRangeStart());
  const [shareEnd, setShareEnd] = useState(settings.coachShareRangeEnd || defaultRangeEnd());
  const [copied, setCopied] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupMessageIsError, setBackupMessageIsError] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const washSaleCount = detectWashSales(trades).length;

  const handleBackupFile = async (file: File | null) => {
    if (!file) return;
    setBackupMessage(null);
    try {
      const parsed = parseBackup(await file.text());
      if (parsed.trades.length === 0 && Object.keys(parsed.settings).length === 0) {
        throw new Error('This backup is empty.');
      }
      setPendingBackup(parsed);
    } catch (err) {
      setBackupMessageIsError(true);
      setBackupMessage(err instanceof Error ? err.message : 'Could not read backup file.');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    setBackupMessage(null);
    try {
      await onRestoreTrades(pendingBackup.trades);
      if (Object.keys(pendingBackup.settings).length > 0) {
        updateSettings(pendingBackup.settings);
      }
      setBackupMessageIsError(false);
      setBackupMessage(
        `Restored ${pendingBackup.trades.length} trade${pendingBackup.trades.length === 1 ? '' : 's'} and settings.`,
      );
      setPendingBackup(null);
    } catch (err) {
      setBackupMessageIsError(true);
      setBackupMessage(err instanceof Error ? err.message : 'Restore failed. Try again.');
    } finally {
      setRestoring(false);
    }
  };

  // Trades within the chosen share range, from the currently active journal — same trade pool the
  // CSV/report exports below use, so "share" always matches what the user is looking at.
  const shareTradesInRange = trades.filter((t) => t.date >= shareStart && t.date <= shareEnd);
  const shareStats = computeStats(shareTradesInRange);

  const handleGenerateShare = async () => {
    if (!user || !username) {
      setCoachMessageIsError(true);
      setCoachMessage('Sign in and set a username to share your trade history.');
      return;
    }
    if (shareStart > shareEnd) {
      setCoachMessageIsError(true);
      setCoachMessage('Start date must be on or before the end date.');
      return;
    }
    setCoachBusy(true);
    setCoachMessage(null);
    setCoachMessageIsError(false);
    try {
      const { token, truncated } = await createTradeHistoryShare(
        user.uid,
        username,
        settings.coachShareToken,
        shareTradesInRange,
        shareStats,
        shareStart,
        shareEnd,
      );
      updateSettings({
        coachShareEnabled: true,
        coachShareToken: token,
        coachShareRangeStart: shareStart,
        coachShareRangeEnd: shareEnd,
      });
      setCoachMessage(
        truncated
          ? 'Link ready — this range has a lot of trades, so it shows the most recent ones.'
          : 'Link ready — share the read-only URL below.',
      );
    } catch (err) {
      setCoachMessageIsError(true);
      setCoachMessage(err instanceof Error ? err.message : 'Could not create the share link.');
    } finally {
      setCoachBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!settings.coachShareToken) {
      updateSettings({ coachShareEnabled: false });
      return;
    }
    setCoachBusy(true);
    try {
      await disableCoachShare(settings.coachShareToken);
      updateSettings({ coachShareEnabled: false, coachShareToken: undefined });
      setCoachMessageIsError(false);
      setCoachMessage('Share link revoked.');
    } catch (err) {
      setCoachMessageIsError(true);
      setCoachMessage(err instanceof Error ? err.message : 'Could not revoke the link.');
    } finally {
      setCoachBusy(false);
    }
  };

  const copyCoachLink = async () => {
    if (!settings.coachShareToken) return;
    await navigator.clipboard.writeText(coachShareUrl(settings.coachShareToken));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pb-6">
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-text-secondary mt-1">Preferences, accounts, and data export</p>
          {firebaseEnabled && user && username && (
            <p className="text-sm text-accent mt-2 font-medium">@{username}</p>
          )}
        </div>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Display</h2>

          <label className="block">
            <span className="text-xs text-text-secondary mb-1.5 block">Currency</span>
            <select
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value as CurrencyCode })}
              className="input-field"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (C$)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-text-secondary mb-1.5 block">Default symbol</span>
            <input
              type="text"
              value={settings.defaultSymbol}
              onChange={(e) => updateSettings({ defaultSymbol: e.target.value.toUpperCase() })}
              className="input-field"
              maxLength={12}
            />
          </label>

          <div>
            <span className="text-xs text-text-secondary mb-2 block">Theme accent</span>
            <div className="flex gap-2">
              {(['emerald', 'cyan', 'violet'] as ThemeAccent[]).map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => updateSettings({ themeAccent: accent })}
                  className={`px-4 py-2 rounded-lg text-sm capitalize border transition-colors focus-ring ${
                    settings.themeAccent === accent
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-border text-text-secondary hover:border-border/80'
                  }`}
                >
                  {accent}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Setup tags</h2>
          <div className="flex flex-wrap gap-2">
            {settings.setupTags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 rounded-full text-xs bg-bg-tertiary border border-border/60">
                {tag}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="New tag name"
              className="input-field flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addSetupTag(newTag);
                  setNewTag('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                addSetupTag(newTag);
                setNewTag('');
              }}
              className="btn-primary px-4 py-2 text-sm"
            >
              <Plus size={16} />
            </button>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Journals</h2>
          <p className="text-xs text-text-secondary">Each journal keeps its own trades — switch from the dashboard anytime.</p>
          <div className="space-y-2">
            {settings.accounts.map((account) => (
              <div
                key={account.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  settings.activeAccountId === account.id
                    ? 'border-profit-bright/40 bg-profit-bright/5'
                    : 'border-border/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveAccount(account.id)}
                  className="flex-1 text-left text-sm font-medium focus-ring rounded"
                >
                  {account.name}
                  {settings.activeAccountId === account.id && (
                    <span className="ml-2 text-[10px] text-profit-bright uppercase">Active</span>
                  )}
                </button>
                {settings.accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAccount(account.id)}
                    className="text-text-secondary hover:text-loss-bright p-1 focus-ring rounded"
                    aria-label={`Remove ${account.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newAccount}
              onChange={(e) => setNewAccount(e.target.value)}
              placeholder="New account name"
              className="input-field flex-1"
            />
            <button
              type="button"
              onClick={() => {
                addAccount(newAccount);
                setNewAccount('');
              }}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Add
            </button>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Trading rules</h2>
          <p className="text-xs text-text-secondary">Track daily limits — violations show on the dashboard analytics panel.</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.tradingRules.enabled}
              onChange={(e) => updateSettings({ tradingRules: { ...settings.tradingRules, enabled: e.target.checked } })}
              className="rounded border-border"
            />
            Enable rule tracking
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Max daily loss ($)</span>
              <input
                type="number"
                value={settings.tradingRules.maxDailyLoss ?? ''}
                onChange={(e) =>
                  updateSettings({
                    tradingRules: { ...settings.tradingRules, maxDailyLoss: Number(e.target.value) || undefined },
                  })
                }
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Max trades / day</span>
              <input
                type="number"
                value={settings.tradingRules.maxTradesPerDay ?? ''}
                onChange={(e) =>
                  updateSettings({
                    tradingRules: { ...settings.tradingRules, maxTradesPerDay: Number(e.target.value) || undefined },
                  })
                }
                className="input-field"
              />
            </label>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Strategy playbook</h2>
          <p className="text-xs text-text-secondary">Define setups and link them to trades in the advanced trade form.</p>
          <div className="space-y-2">
            {settings.strategies.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/60">
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                <button type="button" onClick={() => removeStrategy(s.id)} className="text-text-secondary hover:text-loss-bright p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newStrategy}
              onChange={(e) => setNewStrategy(e.target.value)}
              placeholder="Strategy name"
              className="input-field flex-1"
            />
            <button
              type="button"
              onClick={() => {
                addStrategy(newStrategy);
                setNewStrategy('');
              }}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Add
            </button>
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Goals & reminders</h2>
          <label className="block">
            <span className="text-xs text-text-secondary mb-1 block">
              Monthly P&L goal (0 to disable)
            </span>
            <input
              type="number"
              step="50"
              min="0"
              value={settings.monthlyGoalPnl || ''}
              onChange={(e) =>
                updateSettings({ monthlyGoalPnl: Math.max(0, Number(e.target.value) || 0) })
              }
              className="input-field"
              placeholder="2000"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary mb-1 block">
              Trading capital (unlocks % return vs SPY)
            </span>
            <input
              type="number"
              step="500"
              min="0"
              value={settings.accountSize || ''}
              onChange={(e) =>
                updateSettings({ accountSize: Math.max(0, Number(e.target.value) || 0) })
              }
              className="input-field"
              placeholder="25000"
            />
            <span className="text-[11px] text-text-secondary mt-1 block">
              Only used to turn your P&amp;L into a percentage so it can be compared to the market.
              Leave blank to keep the dashboard in dollars.
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.remindersEnabled}
              onChange={(e) => updateSettings({ remindersEnabled: e.target.checked })}
              className="rounded border-border"
            />
            End-of-day journal reminder
          </label>
          {settings.remindersEnabled && (
            <label className="block">
              <span className="text-xs text-text-secondary mb-1 block">Reminder time (local)</span>
              <input
                type="time"
                value={settings.reminderTime}
                onChange={(e) => updateSettings({ reminderTime: e.target.value })}
                className="input-field"
              />
            </label>
          )}
        </section>

        <section className="panel-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Sharing & charts</h2>
          <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-2">
            <p className="text-sm font-medium">TradingView / chart replay</p>
            <p className="text-xs text-text-secondary">
              Use &quot;Auto-link&quot; in the trade form advanced section, or open chart replay from any trade detail.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Share2 size={14} className="text-text-secondary shrink-0" />
              <p className="text-sm font-medium">Share trade history</p>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Pick a date range and get a read-only link — anyone you send it to can browse every
              trade in that range and click into one to see the full detail: prices, times, fees,
              notes, all of it. They can&apos;t edit anything, and they don&apos;t need an account
              to view it.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-text-secondary mb-1 block">From</span>
                <input
                  type="date"
                  value={shareStart}
                  max={shareEnd}
                  onChange={(e) => setShareStart(e.target.value)}
                  className="input-field text-xs"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-text-secondary mb-1 block">To</span>
                <input
                  type="date"
                  value={shareEnd}
                  min={shareStart}
                  max={defaultRangeEnd()}
                  onChange={(e) => setShareEnd(e.target.value)}
                  className="input-field text-xs"
                />
              </label>
            </div>

            <p className="text-[11px] text-text-secondary">
              {shareTradesInRange.length} trade{shareTradesInRange.length === 1 ? '' : 's'} in this range
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGenerateShare()}
                disabled={coachBusy || shareTradesInRange.length === 0 || !firebaseEnabled}
                className="btn-primary px-3 py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {settings.coachShareEnabled ? 'Update link' : 'Create link'}
              </button>
              {settings.coachShareEnabled && (
                <button
                  type="button"
                  onClick={() => void handleRevokeShare()}
                  disabled={coachBusy}
                  className="btn-secondary px-3 py-2 text-xs text-red-400"
                >
                  Revoke
                </button>
              )}
            </div>

            {coachMessage && (
              <p className={`text-xs ${coachMessageIsError ? 'text-red-400' : 'text-profit-bright'}`}>{coachMessage}</p>
            )}
            {settings.coachShareEnabled && settings.coachShareToken && (
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={coachShareUrl(settings.coachShareToken)}
                  className="input-field flex-1 text-xs"
                />
                <button type="button" onClick={() => void copyCoachLink()} className="btn-secondary px-3 py-2 text-xs inline-flex items-center gap-1">
                  <Copy size={12} />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
            {!firebaseEnabled && (
              <p className="text-[10px] text-text-secondary">Requires cloud sign-in.</p>
            )}
          </div>
        </section>

        <section className="panel-card p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <Trophy size={14} />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Leaderboard</h2>
          </div>

          <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-3">
            <p className="text-xs text-text-secondary leading-relaxed">
              Only trades synced from a connected broker ever count toward a leaderboard ranking —
              manually logged trades are never included, and can&apos;t be. You won&apos;t appear on
              any leaderboard unless you&apos;ve opted in below and have at least one broker-synced trade.
            </p>

            <label className={`flex items-start gap-2 text-sm ${hasSyncedTrade ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={settings.leaderboardOptIn}
                disabled={!hasSyncedTrade}
                onChange={(e) =>
                  updateSettings({
                    leaderboardOptIn: e.target.checked,
                    ...(e.target.checked ? {} : { leaderboardAnonymous: false }),
                  })
                }
                className="rounded border-border mt-0.5"
              />
              <span>
                Show me on the public leaderboard
                {!hasSyncedTrade && (
                  <span className="block text-[11px] text-text-secondary font-normal mt-0.5">
                    Sync a broker and complete at least one trade to unlock this.
                  </span>
                )}
              </span>
            </label>

            {settings.leaderboardOptIn && (
              <label className="flex items-start gap-2 text-sm pl-0.5">
                <input
                  type="checkbox"
                  checked={settings.leaderboardAnonymous}
                  onChange={(e) => updateSettings({ leaderboardAnonymous: e.target.checked })}
                  className="rounded border-border mt-0.5"
                />
                <span className="inline-flex items-center gap-1.5">
                  <EyeOff size={13} className="text-text-secondary" />
                  Show anonymously — hide my username, use a random display name instead
                </span>
              </label>
            )}
          </div>
        </section>

        <section className="panel-card p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Export data</h2>
          <button
            type="button"
            onClick={() => exportTradesCsv(trades, `trades-${year}-${month + 1}.csv`)}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm"
          >
            <Download size={16} />
            Export all trades (CSV)
          </button>
          <button
            type="button"
            onClick={() => exportMonthReport(trades, monthStats, year, month, settings.currency)}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm"
          >
            <FileText size={16} />
            Print monthly report (PDF)
          </button>
          <button
            type="button"
            onClick={() => exportTaxCsv(trades, `tax-realized-${year}.csv`)}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm"
          >
            <Download size={16} />
            Export tax summary (wash-sale aware)
          </button>
          {washSaleCount > 0 && (
            <p className="text-xs text-amber-300">{washSaleCount} potential wash sale(s) flagged in export.</p>
          )}
        </section>

        <section className="panel-card p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Backup & restore</h2>
          <p className="text-xs text-text-secondary">
            Download a full backup of every journal — all trades, tags, accounts, and preferences —
            as one file. Restore it here on any device.
          </p>
          <button
            type="button"
            onClick={() => downloadBackup(everyTrade, settings)}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm"
          >
            <Download size={16} />
            Download full backup ({everyTrade.length} trade{everyTrade.length === 1 ? '' : 's'})
          </button>
          <button
            type="button"
            disabled={restoring}
            onClick={() => backupInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm disabled:opacity-50"
          >
            <Upload size={16} />
            {restoring ? 'Restoring…' : 'Restore from backup'}
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleBackupFile(e.target.files?.[0] ?? null)}
            aria-label="Choose backup file"
          />
          {backupMessage && (
            <p className={`text-xs ${backupMessageIsError ? 'text-red-400' : 'text-profit-bright'}`}>
              {backupMessage}
            </p>
          )}
        </section>
      </div>

      {pendingBackup && (
        <ConfirmDialog
          title="Restore this backup?"
          message={`This will restore ${pendingBackup.trades.length} trade(s)${
            pendingBackup.exportedAt
              ? ` from a backup made ${new Date(pendingBackup.exportedAt).toLocaleDateString()}`
              : ''
          } plus your tags, journals, and preferences. Existing trades with the same IDs are updated; nothing is deleted.`}
          confirmLabel="Restore backup"
          onCancel={() => setPendingBackup(null)}
          onConfirm={() => {
            void handleRestore();
          }}
        />
      )}
    </div>
  );
}
