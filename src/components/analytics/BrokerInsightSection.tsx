import { Crosshair, Layers, ListOrdered } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import type { BreakevenStats, LoadRow, SequenceRow } from '../../utils/brokerAnalytics';
import { BarRow, PanelShell, type PanelFigure } from './PanelShell';
import { tradesMeta } from '../../utils/panelCopy';

/*
 * The broker panels as the landing page's product showcase draws them.
 *
 * These were the Performance screen's cards until its redesign, which draws every breakdown from one
 * model (utils/performanceBreakdowns.ts) as a list and a table instead. The three the marketing page
 * shows stay here as cards, because a card is the right shape for a screenshot of one finding; the
 * rest of the family went with the old screen.
 */

type Currency = Parameters<typeof formatCurrency>[1];

/** A compact figure with a caption, the unit most of these panels are assembled from. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
}) {
  const cls =
    tone === 'profit' ? 'text-profit-bright' : tone === 'loss' ? 'text-loss-bright' : 'text-text-primary';
  return (
    <div className="rounded-lg bg-bg-primary/60 py-2 px-2 text-center">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary leading-tight">{label}</p>
      <p className={`text-xs md:text-sm font-semibold tabular-nums mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

/** The header figure for a P&L: signed, colored by sign. */
function moneyFigure(value: number, currency: Currency, caption: string): PanelFigure {
  return { value: formatCurrency(value, currency), tone: value >= 0 ? 'profit' : 'loss', caption };
}

/** The row a bar panel leads with: the one worth the most money, whichever way. */
function biggest<T extends { pnl: number }>(rows: T[]): T {
  return rows.reduce((a, b) => (Math.abs(b.pnl) > Math.abs(a.pnl) ? b : a));
}

interface PanelProps {
  featured?: boolean;
}

/* ------------------------------------------------------------------ breakeven */

export function BreakevenPanel({ data, featured }: { data: BreakevenStats } & PanelProps) {
  const clears = data.gap >= 0;

  return (
    <PanelShell
      eyebrow="Edge"
      title="The win rate you need"
      icon={<Crosshair size={14} />}
      featured={featured}
      figure={{
        value: `${clears ? '+' : '−'}${Math.abs(data.gap).toFixed(0)} pts`,
        tone: clears ? 'profit' : 'loss',
        caption: clears ? 'Clear of break-even' : 'Short of break-even',
      }}
      note={
        clears ? (
          <>
            Your average win is {data.payoff.toFixed(2)}× your average loss, so {data.requiredWinRate.toFixed(0)}%
            pays for itself — and you are winning {data.winRate.toFixed(0)}%. The edge is in the
            payoff, not the hit rate.
          </>
        ) : (
          <>
            Your average win is {data.payoff.toFixed(2)}× your average loss, which needs{' '}
            {data.requiredWinRate.toFixed(0)}% to break even. You win {data.winRate.toFixed(0)}%. Closing{' '}
            {Math.abs(data.gap).toFixed(0)} points is either winning more often or losing less per loss
            — the second is usually the shorter trip.
          </>
        )
      }
    >
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-2xl md:text-3xl font-semibold tabular-nums ${clears ? 'text-profit-bright' : 'text-loss-bright'}`}>
          {data.requiredWinRate.toFixed(0)}%
        </span>
        <span className="text-[10px] text-text-secondary">to break even</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Figure label="You win" value={`${data.winRate.toFixed(0)}%`} tone={clears ? 'profit' : 'loss'} />
        <Figure label="Payoff" value={`${data.payoff.toFixed(2)}×`} />
        <Figure
          label={clears ? 'Cushion' : 'Short by'}
          value={`${Math.abs(data.gap).toFixed(0)} pts`}
          tone={clears ? 'profit' : 'loss'}
        />
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ sequence */

export function SequencePanel({ rows, currency, featured }: { rows: SequenceRow[]; currency: Currency } & PanelProps) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const best = rows.reduce((a, b) => (b.perTrade > a.perTrade ? b : a));
  const worst = rows.reduce((a, b) => (b.perTrade < a.perTrade ? b : a));
  const lead = biggest(rows);

  return (
    <PanelShell
      eyebrow="Rhythm"
      title="How the day unfolds"
      icon={<ListOrdered size={14} />}
      featured={featured}
      figure={moneyFigure(lead.pnl, currency, `${lead.label} trades of the day`)}
      note={
        best.label !== worst.label ? (
          <>
            Your <span className="text-profit-bright font-medium">{best.label}</span> trade of the day is
            the best one at {formatCurrency(best.perTrade, currency)} each; your{' '}
            <span className="text-loss-bright font-medium">{worst.label}</span> is the worst at{' '}
            {formatCurrency(worst.perTrade, currency)}.
          </>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <BarRow
            index={i}
            key={row.label}
            label={row.label}
            meta={tradesMeta(row.trades, row.winRate)}
            value={row.pnl}
            valueText={formatCurrency(row.pnl, currency)}
            maxAbs={maxAbs}
            labelWidth="w-12"
          />
        ))}
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ daily load */

export function LoadPanel({ rows, currency, featured }: { rows: LoadRow[]; currency: Currency } & PanelProps) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.perDay)), 1);
  const best = rows.reduce((a, b) => (b.perDay > a.perDay ? b : a));
  const worst = rows.reduce((a, b) => (b.perDay < a.perDay ? b : a));
  const lead = rows.reduce((a, b) => (Math.abs(b.net) > Math.abs(a.net) ? b : a));

  return (
    <PanelShell
      eyebrow="Volume"
      title="Quiet days against busy ones"
      icon={<Layers size={14} />}
      featured={featured}
      figure={moneyFigure(lead.net, currency, `Days with ${lead.label}, in total`)}
      note={
        best.label !== worst.label ? (
          <>
            Average day, by how much you traded. Days with{' '}
            <span className="text-profit-bright font-medium">{best.label}</span> are worth{' '}
            {formatCurrency(best.perDay, currency)}; days with{' '}
            <span className="text-loss-bright font-medium">{worst.label}</span>,{' '}
            {formatCurrency(worst.perDay, currency)}. A cap is only worth setting if those two are far
            apart.
          </>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <BarRow
            index={i}
            key={row.label}
            label={row.label}
            meta={`${row.days} day${row.days === 1 ? '' : 's'} · ${Math.round((row.greenDays / row.days) * 100)}% green`}
            value={row.perDay}
            valueText={`${formatCurrency(row.perDay, currency)}/day`}
            maxAbs={maxAbs}
            labelWidth="w-[4.5rem]"
          />
        ))}
      </div>
    </PanelShell>
  );
}
