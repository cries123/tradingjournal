import { useState } from 'react';
import { ArrowLeft, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import type { CurrencyCode, ThemeAccent } from '../types/settings';
import type { Trade } from '../types';
import type { TradingStats } from '../utils/stats';
import { exportMonthReport, exportTradesCsv } from '../utils/exportTrades';

interface SettingsPageProps {
  trades: Trade[];
  monthStats: TradingStats;
  year: number;
  month: number;
  onBack: () => void;
}

export function SettingsPage({ trades, monthStats, year, month, onBack }: SettingsPageProps) {
  const { settings, updateSettings, addSetupTag, addAccount, removeAccount, setActiveAccount } = useSettings();
  const { username, user, firebaseEnabled } = useAuth();
  const [newTag, setNewTag] = useState('');
  const [newAccount, setNewAccount] = useState('');

  return (
    <div className="h-full overflow-y-auto">
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
        </section>
      </div>
    </div>
  );
}
