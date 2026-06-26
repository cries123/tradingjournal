import { useMemo } from 'react';
import { Ghost, Zap } from 'lucide-react';
import type { Trade } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../utils/format';
import { fomoTrades, ghostTrades } from '../utils/tradeFilters';

interface FomoLogWidgetProps {
  trades: Trade[];
}

export function FomoLogWidget({ trades }: FomoLogWidgetProps) {
  const { settings } = useSettings();

  const ghosts = useMemo(() => ghostTrades(trades), [trades]);
  const fomo = useMemo(() => fomoTrades(trades), [trades]);
  const hypotheticalPnl = useMemo(() => ghosts.reduce((s, t) => s + t.pnl, 0), [ghosts]);

  const recent = useMemo(() => {
    const combined = [...ghosts, ...fomo.filter((t) => !t.isGhost)];
    const seen = new Set<string>();
    return combined
      .filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [ghosts, fomo]);

  if (ghosts.length === 0 && fomo.length === 0) return null;

  const fmt = (n: number) => formatCurrency(n, settings.currency);

  return (
    <div className="panel-card p-3 md:p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-400/90 font-medium mb-0.5">Discipline log</p>
          <h3 className="text-sm md:text-base font-semibold text-text-primary">FOMO &amp; missed trades</h3>
          <p className="text-[11px] text-text-secondary mt-1 max-w-lg">
            Ghost trades and FOMO-tagged entries live here — separate from your real P&amp;L. Use them to spot emotional patterns.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatChip icon={Ghost} label="Missed" value={String(ghosts.length)} />
        <StatChip icon={Zap} label="FOMO tagged" value={String(fomo.length)} />
        <div className="rounded-lg bg-bg-primary/60 border border-border/50 px-2 py-2">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary">Hypothetical</p>
          <p className={`text-sm font-bold ${hypotheticalPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {fmt(hypotheticalPnl)}
          </p>
        </div>
      </div>

      {recent.length > 0 && (
        <ul className="space-y-1.5 pt-1 border-t border-border/40">
          {recent.map((trade) => (
            <li key={trade.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex items-center gap-2">
                {trade.isGhost && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-500/15 text-violet-300 border border-violet-500/30">
                    Ghost
                  </span>
                )}
                <span className="font-medium truncate">{trade.symbol}</span>
                <span className="text-text-secondary shrink-0">{trade.date.slice(5)}</span>
                {trade.psychology && (
                  <span className="text-amber-400/90 shrink-0 hidden sm:inline">{trade.psychology}</span>
                )}
              </div>
              <span className={`font-semibold shrink-0 ${trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                {fmt(trade.pnl)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: typeof Ghost; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-primary/60 border border-border/50 px-2 py-2">
      <div className="flex items-center gap-1 text-text-secondary mb-0.5">
        <Icon size={12} />
        <p className="text-[9px] uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-sm font-bold text-text-primary">{value}</p>
    </div>
  );
}
