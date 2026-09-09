import { useMemo } from 'react';
import {
  CalendarClock,
  Coins,
  Crosshair,
  Layers,
  ListOrdered,
  Scale,
  Timer,
  TrendingDown,
} from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import {
  brokerCoverage,
  type BreakevenStats,
  type CostStats,
  type ExpiryRow,
  type InstrumentRow,
  type LoadRow,
  type SequenceRow,
  type SizingStats,
  type TiltStats,
} from '../../utils/brokerAnalytics';
import { BarRow, PanelShell } from './PanelShell';
import { pnlClass } from '../../utils/pnlTone';

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

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-text-secondary mt-2.5 leading-relaxed">{children}</p>;
}

/* ------------------------------------------------------------------ breakeven */

function BreakevenPanel({ data }: { data: BreakevenStats }) {
  const clears = data.gap >= 0;

  return (
    <PanelShell eyebrow="Edge" title="The win rate you need" icon={<Crosshair size={14} />}>
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

      <Note>
        {clears ? (
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
        )}
      </Note>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ sizing */

function SizingPanel({ data, currency }: { data: SizingStats; currency: Currency }) {
  const backwards = data.ratio > 1.15;
  /* Per trade, not in total. On a journal where both halves lose money, comparing the totals says
     the small trades are the bigger problem purely because there are three times as many of them,
     which is the opposite of the truth. */
  const bigOnesCostMore =
    data.biggestQuarterPerTrade < 0 && data.biggestQuarterPerTrade < data.restPerTrade * 1.5;

  return (
    <PanelShell eyebrow="Size" title="Where the money goes" icon={<Scale size={14} />}>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Figure label="Avg size, winners" value={formatCurrency(data.avgWinnerSize, currency)} />
        <Figure label="Avg size, losers" value={formatCurrency(data.avgLoserSize, currency)} />
      </div>

      <div className="rounded-lg bg-bg-primary/60 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-text-secondary">
            Biggest quarter ({data.biggestQuarterTrades} trades)
          </span>
          <span className={`text-xs font-semibold tabular-nums ${pnlClass(data.biggestQuarterNet)}`}>
            {formatCurrency(data.biggestQuarterNet, currency)}
            <span className="text-text-secondary font-normal">
              {' '}
              · {formatCurrency(data.biggestQuarterPerTrade, currency)}/t
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className="text-[10px] text-text-secondary">
            Everything else ({data.restTrades} trades)
          </span>
          <span className={`text-xs font-semibold tabular-nums ${pnlClass(data.restNet)}`}>
            {formatCurrency(data.restNet, currency)}
            <span className="text-text-secondary font-normal">
              {' '}
              · {formatCurrency(data.restPerTrade, currency)}/t
            </span>
          </span>
        </div>
      </div>

      <Note>
        {bigOnesCostMore ? (
          <>
            Your largest quarter of positions loses{' '}
            <span className="text-loss-bright font-medium">
              {formatCurrency(Math.abs(data.biggestQuarterPerTrade), currency)}
            </span>{' '}
            a trade against{' '}
            {formatCurrency(Math.abs(data.restPerTrade), currency)} on the rest. Whatever the average
            size says, the big ones are where the damage is.
          </>
        ) : backwards ? (
          <>
            You put {data.ratio.toFixed(2)}× more on the trades that lose than the ones that win.
            Conviction is pointing the wrong way.
          </>
        ) : data.ratio < 0.87 ? (
          <>
            Your winners carry {(1 / data.ratio).toFixed(2)}× the size of your losers — size is
            following the edge, which is the way round it should be.
          </>
        ) : (
          <>
            Winners and losers are sized about the same, so the result is coming from the trades
            themselves rather than from how much you bet.
          </>
        )}
      </Note>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ tilt */

function TiltPanel({ data, currency }: { data: TiltStats; currency: Currency }) {
  const tilts = data.delta < 0;

  return (
    <PanelShell eyebrow="Discipline" title="The trade after a loss" icon={<TrendingDown size={14} />}>
      <div className="grid grid-cols-2 gap-2">
        <Figure
          label={`After a loss (${data.afterLossCount})`}
          value={formatCurrency(data.afterLossAvg, currency)}
          tone={data.afterLossAvg >= 0 ? 'profit' : 'loss'}
        />
        <Figure
          label={`After a win (${data.afterWinCount})`}
          value={formatCurrency(data.afterWinAvg, currency)}
          tone={data.afterWinAvg >= 0 ? 'profit' : 'loss'}
        />
      </div>

      <Note>
        {tilts ? (
          <>
            The trade you take straight after a red one is worth{' '}
            <span className="text-loss-bright font-medium">
              {formatCurrency(Math.abs(data.delta), currency)}
            </span>{' '}
            less than the one after a green one. That gap is the cost of trading angry, and a
            five-minute rule after a loss is the cheapest fix in this journal.
          </>
        ) : (
          <>
            You trade the same after a loss as after a win — the gap is{' '}
            {formatCurrency(Math.abs(data.delta), currency)} in the other direction. Whatever is
            costing you, it is not tilt.
          </>
        )}
      </Note>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ sequence */

function SequencePanel({ rows, currency }: { rows: SequenceRow[]; currency: Currency }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const best = rows.reduce((a, b) => (b.perTrade > a.perTrade ? b : a));
  const worst = rows.reduce((a, b) => (b.perTrade < a.perTrade ? b : a));

  return (
    <PanelShell eyebrow="Rhythm" title="How the day unfolds" icon={<ListOrdered size={14} />}>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <BarRow
            key={row.label}
            label={row.label}
            meta={`${row.trades}t · ${Math.round(row.winRate)}%`}
            value={row.pnl}
            valueText={formatCurrency(row.pnl, currency)}
            maxAbs={maxAbs}
            labelWidth="w-12"
          />
        ))}
      </div>

      {best.label !== worst.label && (
        <Note>
          Your <span className="text-profit-bright font-medium">{best.label}</span> trade of the day is
          the best one at {formatCurrency(best.perTrade, currency)} each; your{' '}
          <span className="text-loss-bright font-medium">{worst.label}</span> is the worst at{' '}
          {formatCurrency(worst.perTrade, currency)}.
        </Note>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ daily load */

function LoadPanel({ rows, currency }: { rows: LoadRow[]; currency: Currency }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.perDay)), 1);
  const best = rows.reduce((a, b) => (b.perDay > a.perDay ? b : a));
  const worst = rows.reduce((a, b) => (b.perDay < a.perDay ? b : a));

  return (
    <PanelShell eyebrow="Volume" title="Quiet days against busy ones" icon={<Layers size={14} />}>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <BarRow
            key={row.label}
            label={row.label}
            meta={`${row.days}d · ${Math.round((row.greenDays / row.days) * 100)}%`}
            value={row.perDay}
            valueText={formatCurrency(row.perDay, currency)}
            maxAbs={maxAbs}
            labelWidth="w-[4.5rem]"
          />
        ))}
      </div>

      {best.label !== worst.label && (
        <Note>
          Average day, by how much you traded. Your{' '}
          <span className="text-profit-bright font-medium">{best.label.toLowerCase()}</span> days are
          worth {formatCurrency(best.perDay, currency)}; your{' '}
          <span className="text-loss-bright font-medium">{worst.label.toLowerCase()}</span> days,{' '}
          {formatCurrency(worst.perDay, currency)}. A cap is only worth setting if those two are far
          apart.
        </Note>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ expiry */

function ExpiryPanel({ rows, currency }: { rows: ExpiryRow[]; currency: Currency }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const worst = rows.reduce((a, b) => (b.pnl < a.pnl ? b : a));
  const best = rows.reduce((a, b) => (b.pnl > a.pnl ? b : a));

  return (
    <PanelShell eyebrow="Expiry" title="Time left when you opened" icon={<CalendarClock size={14} />}>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <BarRow
            key={row.label}
            label={row.label}
            meta={`${row.trades}t · ${Math.round(row.winRate)}%`}
            value={row.pnl}
            valueText={formatCurrency(row.pnl, currency)}
            maxAbs={maxAbs}
            labelWidth="w-16"
          />
        ))}
      </div>

      {best.label !== worst.label && worst.pnl < 0 && (
        <Note>
          <span className="text-loss-bright font-medium">{worst.label}</span> contracts have cost you{' '}
          {formatCurrency(Math.abs(worst.pnl), currency)} across {worst.trades} trades, while{' '}
          <span className="text-profit-bright font-medium">{best.label}</span> made{' '}
          {formatCurrency(best.pnl, currency)}. Same trader, different instrument.
        </Note>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ instruments */

function InstrumentPanel({ rows, currency }: { rows: InstrumentRow[]; currency: Currency }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const trap = rows.find((r) => r.winRate >= 55 && r.pnl < 0);

  return (
    <PanelShell eyebrow="Mix" title="Calls, puts and shares" icon={<Timer size={14} />}>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <BarRow
            key={row.label}
            label={row.label}
            meta={`${row.trades}t · ${Math.round(row.winRate)}%`}
            value={row.pnl}
            valueText={formatCurrency(row.pnl, currency)}
            maxAbs={maxAbs}
            labelWidth="w-14"
          />
        ))}
      </div>

      {trap && (
        <Note>
          <span className="text-loss-bright font-medium">{trap.label}</span> win{' '}
          {Math.round(trap.winRate)}% of the time and still lose money — the wins are too small for
          the losses.
        </Note>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ cost */

function CostPanel({ data, currency }: { data: CostStats; currency: Currency }) {
  const heavy = data.shareOfGross >= 20;

  return (
    <PanelShell eyebrow="Costs" title="What trading cost you" icon={<Coins size={14} />}>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl md:text-3xl font-semibold tabular-nums text-loss-bright">
          {formatCurrency(data.fees, currency)}
        </span>
        <span className="text-[10px] text-text-secondary">in fees</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Figure label="Per trade" value={formatCurrency(data.perTrade, currency)} />
        <Figure
          label="Of gross profit"
          value={data.grossProfit > 0 ? `${data.shareOfGross.toFixed(0)}%` : '—'}
          tone={heavy ? 'loss' : 'neutral'}
        />
      </div>

      <Note>
        {data.grossProfit <= 0 ? (
          <>
            Commissions across {data.covered} trades. There was no gross profit this period for them
            to come out of.
          </>
        ) : heavy ? (
          <>
            {data.shareOfGross.toFixed(0)}% of everything you made gross went to commissions. Fewer,
            larger trades is the only lever that moves this one.
          </>
        ) : (
          <>
            Commissions took {data.shareOfGross.toFixed(0)}% of your gross profit across{' '}
            {data.covered} trades — not what is deciding your year.
          </>
        )}
      </Note>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ section */

/**
 * The panels a broker sync can fill in on its own.
 *
 * Every one of these reads a field that arrives with the import — a quantity, a price, a fee, an
 * expiry, or nothing at all but the order the trades came in. Nothing here asks the trader to have
 * tagged, graded or timed anything, which is what makes it the half of the Performance screen that
 * draws for somebody who has only ever pressed Sync.
 */
export function BrokerInsightSection({ trades }: { trades: Trade[] }) {
  const { settings } = useSettings();
  const coverage = useMemo(() => brokerCoverage(trades), [trades]);
  const currency = settings.currency;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
      {coverage.breakeven && <BreakevenPanel data={coverage.breakeven} />}
      {coverage.sizing && <SizingPanel data={coverage.sizing} currency={currency} />}
      {coverage.tilt && <TiltPanel data={coverage.tilt} currency={currency} />}
      {coverage.sequence.length > 1 && <SequencePanel rows={coverage.sequence} currency={currency} />}
      {coverage.load.length > 1 && <LoadPanel rows={coverage.load} currency={currency} />}
      {coverage.expiry.length > 1 && <ExpiryPanel rows={coverage.expiry} currency={currency} />}
      {coverage.instruments.length > 1 && (
        <InstrumentPanel rows={coverage.instruments} currency={currency} />
      )}
      {coverage.cost && <CostPanel data={coverage.cost} currency={currency} />}
    </div>
  );
}
