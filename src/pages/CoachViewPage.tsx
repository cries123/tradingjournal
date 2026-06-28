import { useEffect, useState } from 'react';
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchCoachShare, type CoachShareSnapshot } from '../services/coachShare';
import { formatCurrency } from '../utils/format';
import { BrandLogo } from '../components/BrandLogo';

interface CoachViewPageProps {
  token: string;
  onHome: () => void;
}

export function CoachViewPage({ token, onHome }: CoachViewPageProps) {
  const [data, setData] = useState<CoachShareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCoachShare(token)
      .then((snap) => {
        if (!snap?.enabled) setError('This coach link is invalid or has been disabled.');
        else setData(snap);
      })
      .catch(() => setError('Could not load shared journal.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-dvh bg-bg-primary dashboard-bg">
      <header className="border-b border-border/50 bg-bg-secondary/40 px-4 py-4 md:px-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <BrandLogo variant="compact" />
          <button type="button" onClick={onHome} className="text-sm text-text-secondary hover:text-emerald-400 inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            Home
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        {loading && <p className="text-text-secondary text-sm">Loading shared journal…</p>}
        {error && <p className="text-loss-bright text-sm">{error}</p>}

        {data && (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-emerald-400/80">Read-only coach view</p>
              <h1 className="text-2xl font-bold mt-1">@{data.ownerUsername}</h1>
              <p className="text-sm text-text-secondary mt-1">{data.monthLabel} · updated {new Date(data.updatedAt).toLocaleDateString()}</p>
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

            <section className="panel-card overflow-hidden">
              <h2 className="text-sm font-semibold px-4 py-3 border-b border-border/50">Recent trades</h2>
              <div className="divide-y divide-border/40">
                {data.recentTrades.map((t, i) => (
                  <div key={`${t.date}-${t.symbol}-${i}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-text-secondary ml-2 text-xs">{t.date}</span>
                      {t.setup && <span className="text-text-secondary ml-2 text-xs">{t.setup}</span>}
                    </div>
                    <span className={t.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
                      {formatCurrency(t.pnl)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <p className="text-xs text-text-secondary text-center">
              Shared via Trend Chasers coach mode — notes and account details are hidden.
            </p>
          </>
        )}
      </main>
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
