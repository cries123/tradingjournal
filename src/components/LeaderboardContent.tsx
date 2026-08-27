import { useMemo, useState } from 'react';
import { ArrowLeft, EyeOff, Shield, Target, TrendingUp, Trophy } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../utils/format';

interface LeaderboardContentProps {
  onBack: () => void;
}

type Category = 'profit' | 'consistency' | 'risk';

interface LeaderboardEntry {
  id: string;
  displayName: string;
  isAnonymous: boolean;
  isYou?: boolean;
  netPnl: number;
  winRate: number;
  avgRR: number;
  tradeCount: number;
}

// PLACEHOLDER DATA — this whole file renders mock entries so the design can be reviewed before
// the real cross-account aggregation pipeline is built. A live version needs a server-side job
// (not the client) that reads each opted-in user's own synced trades and writes an aggregated,
// non-PII entry to a shared, client-read-only collection — never computed or trusted from the
// client, for the same reason a synced trade's own numbers can't be trusted if it's client-editable.
const MOCK_ENTRIES: LeaderboardEntry[] = [
  { id: '1', displayName: 'alexrivera_fx', isAnonymous: false, netPnl: 18420, winRate: 71.2, avgRR: 2.8, tradeCount: 96 },
  { id: '2', displayName: 'Anonymous Trader', isAnonymous: true, netPnl: 15200, winRate: 58.4, avgRR: 3.4, tradeCount: 142 },
  { id: '3', displayName: 'quinnochoa', isAnonymous: false, netPnl: 12980, winRate: 64.9, avgRR: 2.1, tradeCount: 77 },
  { id: '4', displayName: 'jayhealey', isAnonymous: false, isYou: true, netPnl: 9540, winRate: 55.3, avgRR: 1.9, tradeCount: 61 },
  { id: '5', displayName: 'delta_daytrader', isAnonymous: false, netPnl: 8100, winRate: 62.0, avgRR: 1.6, tradeCount: 130 },
  { id: '6', displayName: 'Anonymous Trader', isAnonymous: true, netPnl: 7300, winRate: 49.8, avgRR: 2.6, tradeCount: 54 },
  { id: '7', displayName: 'priya.trades', isAnonymous: false, netPnl: 6200, winRate: 68.1, avgRR: 1.3, tradeCount: 40 },
  { id: '8', displayName: 'northstar_options', isAnonymous: false, netPnl: 5100, winRate: 44.2, avgRR: 3.1, tradeCount: 88 },
  { id: '9', displayName: 'cole_martinez', isAnonymous: false, netPnl: 4300, winRate: 60.5, avgRR: 1.1, tradeCount: 33 },
  { id: '10', displayName: 'Anonymous Trader', isAnonymous: true, netPnl: 3600, winRate: 52.7, avgRR: 1.8, tradeCount: 45 },
  { id: '11', displayName: 'teejaytrades', isAnonymous: false, netPnl: 2100, winRate: 47.3, avgRR: 1.4, tradeCount: 29 },
  { id: '12', displayName: 'bearmarketbrian', isAnonymous: false, netPnl: -800, winRate: 38.9, avgRR: 0.9, tradeCount: 22 },
];

const MIN_TRADES_FOR_RATE_CATEGORIES = 20;

const CATEGORIES: Array<{ key: Category; label: string; icon: typeof TrendingUp; sublabel: string }> = [
  { key: 'profit', label: 'Most Profitable', icon: TrendingUp, sublabel: 'Ranked by net P&L' },
  { key: 'consistency', label: 'Most Consistent', icon: Target, sublabel: `Ranked by win rate · ${MIN_TRADES_FOR_RATE_CATEGORIES}+ trades` },
  { key: 'risk', label: 'Best Risk Management', icon: Shield, sublabel: `Ranked by avg win/loss ratio · ${MIN_TRADES_FOR_RATE_CATEGORIES}+ trades` },
];

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
  if (rank === 2) return 'bg-slate-400/15 text-slate-200 border-slate-400/40';
  if (rank === 3) return 'bg-orange-500/15 text-orange-300 border-orange-500/40';
  return 'bg-bg-tertiary text-text-secondary border-border/50';
}

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 _.]/g, '').split(/[ _.]/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function LeaderboardContent({ onBack }: LeaderboardContentProps) {
  const { settings } = useSettings();
  const [category, setCategory] = useState<Category>('profit');

  const entries = useMemo(() => {
    const eligible = MOCK_ENTRIES.filter(
      (e) => category === 'profit' || e.tradeCount >= MIN_TRADES_FOR_RATE_CATEGORIES,
    );
    const sorted = [...eligible].sort((a, b) => {
      if (category === 'profit') return b.netPnl - a.netPnl;
      if (category === 'consistency') return b.winRate - a.winRate;
      return b.avgRR - a.avgRR;
    });
    return sorted;
  }, [category]);

  const activeCategory = CATEGORIES.find((c) => c.key === category)!;

  const primaryStat = (e: LeaderboardEntry): { value: string; positive: boolean } => {
    if (category === 'profit') return { value: formatCurrency(e.netPnl, settings.currency), positive: e.netPnl >= 0 };
    if (category === 'consistency') return { value: `${e.winRate.toFixed(1)}%`, positive: true };
    return { value: `${e.avgRR.toFixed(2)}R`, positive: true };
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
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <Trophy size={16} />
            </span>
            <h1 className="text-2xl font-bold">Leaderboard</h1>
          </div>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">
            Only broker-synced trades ever count here — manual entries are excluded, and account
            values are verified against the broker, not self-reported.
          </p>
        </div>

        {!settings.leaderboardOptIn && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-200/90 leading-relaxed">
            You&apos;re not opted in, so you won&apos;t appear here yourself. Turn it on in Settings →
            Leaderboard once you have a broker-synced trade.
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.key === category;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`flex-1 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold border transition-colors focus-ring ${
                  active
                    ? 'bg-accent/10 border-accent/40 text-accent'
                    : 'bg-bg-tertiary/60 border-border/50 text-text-secondary hover:text-text-primary hover:border-border'
                }`}
              >
                <Icon size={14} />
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-text-secondary -mt-4">{activeCategory.sublabel}</p>

        <div className="panel-card divide-y divide-border/50 overflow-hidden">
          {entries.map((entry, i) => {
            const rank = i + 1;
            const stat = primaryStat(entry);
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-3.5 ${
                  entry.isYou ? 'bg-accent/[0.06] ring-1 ring-inset ring-accent/30' : ''
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 ${rankBadgeClass(rank)}`}
                >
                  {rank}
                </span>

                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    entry.isAnonymous
                      ? 'bg-bg-tertiary text-text-secondary/60'
                      : 'bg-gradient-to-br from-accent/30 to-profit-bright/20 text-text-primary'
                  }`}
                >
                  {entry.isAnonymous ? <EyeOff size={14} /> : initials(entry.displayName)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {entry.isAnonymous ? (
                      <span className="text-text-secondary italic">Anonymous Trader</span>
                    ) : (
                      <span className="truncate">@{entry.displayName}</span>
                    )}
                    {entry.isYou && (
                      <span className="text-[10px] font-semibold text-accent bg-accent/10 rounded-full px-1.5 py-0.5 shrink-0">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-text-secondary">{entry.tradeCount} synced trades</p>
                </div>

                <span
                  className={`text-sm font-bold tabular-nums shrink-0 ${
                    stat.positive ? 'text-profit-bright' : 'text-loss-bright'
                  }`}
                >
                  {stat.value}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-text-secondary/70 text-center leading-relaxed">
          Rankings shown are placeholder data for design review — live rankings will only ever
          reflect real, broker-verified trades from users who&apos;ve opted in.
        </p>
      </div>
    </div>
  );
}
