import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchCoachShare, type CoachShareSnapshot, type SharedTrade } from '../services/coachShare';
import { formatCurrency } from '../utils/format';
import { BrandLogo } from '../components/BrandLogo';
import { Starfield } from '../components/Starfield';
import { TradeDetails } from '../components/TradeDetails';

interface CoachViewPageProps {
  token: string;
  onHome: () => void;
}

function formatRange(start: string, end: string): string {
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export function CoachViewPage({ token, onHome }: CoachViewPageProps) {
  const [data, setData] = useState<CoachShareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void fetchCoachShare(token)
      .then((snap) => {
        if (!snap?.enabled) setError('This link is invalid or has been revoked.');
        else setData(snap);
      })
      .catch(() => setError('Could not load this shared trade history.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-dvh bg-bg-primary dashboard-bg">
      <Starfield />
      <header className="relative border-b border-border/50 bg-bg-secondary/40 px-4 py-4 md:px-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <BrandLogo variant="compact" />
          <button type="button" onClick={onHome} className="text-sm text-text-secondary hover:text-accent inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            Home
          </button>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        {loading && <p className="text-text-secondary text-sm">Loading shared trade history…</p>}
        {error && <p className="text-loss-bright text-sm">{error}</p>}

        {data && (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-accent/80">Read-only trade history</p>
              <h1 className="text-2xl font-bold mt-1">@{data.ownerUsername}</h1>
              <p className="text-sm text-text-secondary mt-1">
                {formatRange(data.rangeStart, data.rangeEnd)} · updated {new Date(data.updatedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Net P&L" value={formatCurrency(data.stats.netPnl)} positive={data.stats.netPnl >= 0} />
              <Stat label="Win rate" value={`${data.stats.winRate.toFixed(1)}%`} />
              <Stat label="Trades" value={String(data.stats.totalTrades)} />
              <Stat
                label="Profit factor"
                value={data.stats.profitFactor >= 99 ? '∞' : data.stats.profitFactor.toFixed(2)}
              />
            </div>

            {data.truncated && (
              <p className="text-[11px] text-amber-300/80 bg-amber-500/[0.06] border border-amber-500/30 rounded-lg px-3 py-2">
                This range has more trades than fit in one link — showing the most recent {data.trades.length}.
              </p>
            )}

            <section className="panel-card overflow-hidden">
              <h2 className="text-sm font-semibold px-4 py-3 border-b border-border/50">
                Trades ({data.trades.length}) · click one to expand
              </h2>
              <div className="divide-y divide-border/40">
                {data.trades.map((t, i) => (
                  <TradeRow
                    key={`${t.date}-${t.symbol}-${i}`}
                    trade={t}
                    expanded={expandedId === `${t.date}-${t.symbol}-${i}`}
                    onToggle={() =>
                      setExpandedId((cur) =>
                        cur === `${t.date}-${t.symbol}-${i}` ? null : `${t.date}-${t.symbol}-${i}`,
                      )
                    }
                  />
                ))}
                {data.trades.length === 0 && (
                  <p className="px-4 py-6 text-sm text-text-secondary text-center">No trades in this range.</p>
                )}
              </div>
            </section>

            <p className="text-xs text-text-secondary text-center">
              Shared read-only via Trend Chasers — account and broker identifiers are hidden.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function TradeRow({ trade, expanded, onToggle }: { trade: SharedTrade; expanded: boolean; onToggle: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left hover:bg-bg-tertiary/40 transition-colors focus-ring"
      >
        <div className="min-w-0 flex items-center gap-2">
          <ChevronDown size={13} className={`text-text-secondary shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <span className="font-medium truncate">{trade.symbol}</span>
          <span className="text-text-secondary text-xs shrink-0">{trade.date}</span>
          {trade.setup && <span className="text-text-secondary text-xs truncate hidden sm:inline">{trade.setup}</span>}
        </div>
        <span className={`shrink-0 font-medium ${trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
          {formatCurrency(trade.pnl)}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 -mt-1">
          <TradeDetails trade={trade} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="panel-card p-3">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-lg font-semibold mt-1 flex items-center gap-1 ${positive === true ? 'text-profit-bright' : positive === false ? 'text-loss-bright' : ''}`}>
        {positive === true && <TrendingUp size={14} />}
        {positive === false && <TrendingDown size={14} />}
        {value}
      </p>
    </div>
  );
}
