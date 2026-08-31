import { useEffect, useState } from 'react';
import { ArrowLeft, EyeOff, Shield, Target, TrendingUp, Trophy, Users } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useSettings } from '../context/useSettings';
import {
  MIN_TRADES_FOR_RATE_CATEGORIES,
  subscribeLeaderboard,
  type LeaderboardCategory,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '../services/leaderboard';
import { formatCurrency } from '../utils/format';

interface LeaderboardContentProps {
  onBack: () => void;
}

const CATEGORIES: Array<{ key: LeaderboardCategory; label: string; icon: typeof TrendingUp; sublabel: string }> = [
  { key: 'profit', label: 'Most Profitable', icon: TrendingUp, sublabel: 'Ranked by net P&L' },
  { key: 'consistency', label: 'Most Consistent', icon: Target, sublabel: `Ranked by win rate · ${MIN_TRADES_FOR_RATE_CATEGORIES}+ trades in range` },
  { key: 'risk', label: 'Best Risk Management', icon: Shield, sublabel: `Ranked by avg win/loss ratio · ${MIN_TRADES_FOR_RATE_CATEGORIES}+ trades in range` },
];

const PERIODS: Array<{ key: LeaderboardPeriod; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'allTime', label: 'All time' },
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
  const { user, firebaseEnabled } = useAuth();
  const [category, setCategory] = useState<LeaderboardCategory>('profit');
  const [period, setPeriod] = useState<LeaderboardPeriod>('allTime');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!firebaseEnabled) {
      // Clearing state before the fetch or subscription below. This is the external-system sync
      // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
      // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
      // rule rather than to fix a bug.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    const unsubscribe = subscribeLeaderboard(
      period,
      category,
      (next) => {
        setEntries(next);
        setLoading(false);
      },
      () => {
        setLoadError(true);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [period, category, firebaseEnabled]);

  const activeCategory = CATEGORIES.find((c) => c.key === category)!;

  const primaryStat = (e: LeaderboardEntry): { value: string; positive: boolean } => {
    const s = e.stats[period];
    if (category === 'profit') return { value: formatCurrency(s.netPnl, settings.currency), positive: s.netPnl >= 0 };
    if (category === 'consistency') return { value: `${s.winRate.toFixed(1)}%`, positive: true };
    return { value: s.avgRR >= 99 ? '∞' : `${s.avgRR.toFixed(2)}R`, positive: true };
  };

  return (
    <div className="pb-6">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Trophy size={16} />
              </span>
              <h1 className="text-2xl font-bold">Leaderboard</h1>
            </div>
            <p className="text-sm text-text-secondary mt-2 leading-relaxed max-w-xl">
              Only broker-synced trades ever count here — manual entries are excluded, and account
              values are verified against the broker, not self-reported.
            </p>
          </div>

          <div className="flex gap-1 rounded-full border border-border/60 bg-bg-tertiary/40 p-1 shrink-0">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors focus-ring ${
                  period === p.key
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {!settings.leaderboardOptIn && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-200/90 leading-relaxed">
            You&apos;re not opted in, so you won&apos;t appear here yourself. Turn it on in Settings →
            Leaderboard once you have a broker-synced trade.
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.key === category;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-semibold border transition-colors focus-ring justify-center ${
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

        {!firebaseEnabled ? (
          <div className="panel-card p-8 text-center">
            <Users size={22} className="mx-auto text-text-secondary mb-3" />
            <p className="text-sm font-medium">Sign in to see the leaderboard</p>
            <p className="text-xs text-text-secondary mt-1.5 max-w-sm mx-auto leading-relaxed">
              Rankings are shared across everyone who&apos;s opted in — cloud sync needs to be set up
              for this deployment to load them.
            </p>
          </div>
        ) : loading ? (
          <div className="panel-card divide-y divide-border/50 overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 animate-pulse">
                <span className="w-7 h-7 rounded-full bg-bg-tertiary shrink-0" />
                <span className="w-9 h-9 rounded-full bg-bg-tertiary shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-28 rounded bg-bg-tertiary" />
                  <div className="h-2.5 w-20 rounded bg-bg-tertiary" />
                </div>
                <div className="h-4 w-16 rounded bg-bg-tertiary shrink-0" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="panel-card p-8 text-center">
            <p className="text-sm text-loss-bright font-medium">Couldn&apos;t load the leaderboard</p>
            <p className="text-xs text-text-secondary mt-1.5">Check your connection and try again.</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="panel-card p-8 text-center">
            <Trophy size={22} className="mx-auto text-text-secondary mb-3" />
            <p className="text-sm font-medium">Nobody&apos;s on this one yet</p>
            <p className="text-xs text-text-secondary mt-1.5 max-w-sm mx-auto leading-relaxed">
              {settings.leaderboardOptIn
                ? `You're opted in, but nothing qualifies for ${activeCategory.label.toLowerCase()} over this period yet — sync some trades and check back.`
                : 'Turn on "Show me on the public leaderboard" in Settings to be the first.'}
            </p>
          </div>
        ) : (
          <div className="panel-card divide-y divide-border/50 overflow-hidden">
            {entries.map((entry, i) => {
              const rank = i + 1;
              const stat = primaryStat(entry);
              const isYou = entry.uid === user?.uid;
              // username is absent on anonymous entries, and on older rows written before that
              // changed it may still be present — anonLabel wins either way.
              const displayName = entry.isAnonymous
                ? entry.anonLabel
                : entry.username || entry.anonLabel;
              return (
                <div
                  key={entry.uid}
                  className={`flex items-center gap-3 p-3.5 ${
                    isYou ? 'bg-accent/[0.06] ring-1 ring-inset ring-accent/30' : ''
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
                    {entry.isAnonymous ? <EyeOff size={14} /> : initials(displayName)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {entry.isAnonymous ? (
                        <span className="text-text-secondary italic">{displayName}</span>
                      ) : (
                        <span className="truncate">@{displayName}</span>
                      )}
                      {isYou && (
                        <span className="text-[10px] font-semibold text-accent bg-accent/10 rounded-full px-1.5 py-0.5 shrink-0">
                          You
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-text-secondary">{entry.stats[period].tradeCount} synced trades</p>
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
        )}
      </div>
    </div>
  );
}
