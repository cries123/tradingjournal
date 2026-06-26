import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Copy, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import type { CurrencyCode, ThemeAccent } from '../types/settings';
import type { Trade } from '../types';
import type { TradingStats } from '../utils/stats';
import { exportMonthReport, exportTaxCsv, exportTradesCsv } from '../utils/exportTrades';
import { BrokerConnectionsPanel } from './integrations/BrokerConnectionsPanel';
import { useLiveBenchmark } from '../hooks/useLiveBenchmark';
import {
  coachShareUrl,
  disableCoachShare,
  enableCoachShare,
  refreshCoachShare,
} from '../services/coachShare';
import { detectWashSales } from '../utils/washSale';

interface SettingsPageProps {
  trades: Trade[];
  monthStats: TradingStats;
  year: number;
  month: number;
  onBack: () => void;
  onBrokerTradesImported?: (trades: Omit<Trade, 'id'>[]) => void;
}

export function SettingsPage({ trades, monthStats, year, month, onBack, onBrokerTradesImported }: SettingsPageProps) {
  const { settings, updateSettings, addSetupTag, addStrategy, removeStrategy, addAccount, removeAccount, setActiveAccount } = useSettings();
  const { username, user, firebaseEnabled } = useAuth();
  const [newTag, setNewTag] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newStrategy, setNewStrategy] = useState('');
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { quote: liveBenchmark, loading: benchmarkLoading } = useLiveBenchmark(
    settings.benchmarkSymbol,
    settings.liveBenchmarkEnabled,
  );

  const washSaleCount = detectWashSales(trades).length;

  const syncCoachShare = useCallback(async () => {
    if (!settings.coachShareEnabled || !user || !username || !settings.coachShareToken) return;
    await refreshCoachShare(settings.coachShareToken, trades, monthStats, year, month, user.uid, username);
  }, [settings.coachShareEnabled, settings.coachShareToken, user, username, trades, monthStats, year, month]);

  useEffect(() => {
    void syncCoachShare();
  }, [syncCoachShare]);

  const handleCoachToggle = async (enabled: boolean) => {
    if (!user || !username) {
      setCoachMessage('Sign in and set a username to enable coach sharing.');
      return;
    }
    setCoachBusy(true);
    setCoachMessage(null);
    try {
      if (enabled) {
        const token = await enableCoachShare(user.uid, username, settings.coachShareToken, trades, monthStats, year, month);
        updateSettings({ coachShareEnabled: true, coachShareToken: token });
        setCoachMessage('Coach link ready — share the read-only URL below.');
      } else if (settings.coachShareToken) {
        await disableCoachShare(settings.coachShareToken);
        updateSettings({ coachShareEnabled: false, coachShareToken: undefined });
        setCoachMessage('Coach sharing disabled.');
      } else {
        updateSettings({ coachShareEnabled: false });
      }
    } catch (err) {
      setCoachMessage(err instanceof Error ? err.message : 'Coach share update failed');
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
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-text-secondary mt-1">Preferences, accounts, and data export</p>
          {firebaseEnabled && user && username && (
            <p className="text-sm text-emerald-300 mt-2 font-medium">@{username}</p>
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
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
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
                    ? 'border-emerald-500/40 bg-emerald-500/5'
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
                    <span className="ml-2 text-[10px] text-emerald-400 uppercase">Active</span>
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Benchmark & reminders</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.liveBenchmarkEnabled}
              onChange={(e) => updateSettings({ liveBenchmarkEnabled: e.target.checked })}
              className="rounded border-border"
            />
            Live {settings.benchmarkSymbol} benchmark (Yahoo Finance)
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary mb-1 block">Benchmark symbol</span>
            <input
              type="text"
              value={settings.benchmarkSymbol}
              onChange={(e) => updateSettings({ benchmarkSymbol: e.target.value.toUpperCase() })}
              className="input-field"
              maxLength={12}
            />
          </label>
          {settings.liveBenchmarkEnabled && (
            <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 px-3 py-2 text-xs">
              {benchmarkLoading ? (
                <span className="text-text-secondary">Loading live benchmark…</span>
              ) : liveBenchmark ? (
                <span className="text-emerald-300">
                  {liveBenchmark.symbol} MTD {liveBenchmark.monthToDateReturnPct >= 0 ? '+' : ''}
                  {liveBenchmark.monthToDateReturnPct}% (as of {liveBenchmark.asOf})
                </span>
              ) : (
                <span className="text-text-secondary">Live benchmark unavailable — enter manual % below.</span>
              )}
            </div>
          )}
          <label className="block">
            <span className="text-xs text-text-secondary mb-1 block">Manual benchmark return % (fallback)</span>
            <input
              type="number"
              step="0.1"
              value={settings.benchmarkReturnPct || ''}
              onChange={(e) => updateSettings({ benchmarkReturnPct: Number(e.target.value) || 0 })}
              className="input-field"
              placeholder="2.5"
            />
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Integrations</h2>
          <BrokerConnectionsPanel
            onTradesImported={(imported) => {
              onBrokerTradesImported?.(imported);
            }}
          />
          <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-2">
            <p className="text-sm font-medium">TradingView / chart replay</p>
            <p className="text-xs text-text-secondary">
              Use &quot;Auto-link&quot; in the trade form advanced section, or open chart replay from any trade detail.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.coachShareEnabled}
                disabled={coachBusy}
                onChange={(e) => void handleCoachToggle(e.target.checked)}
                className="rounded border-border"
              />
              Read-only coach sharing
            </label>
            {coachMessage && <p className="text-xs text-emerald-300">{coachMessage}</p>}
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
      </div>
    </div>
  );
}
