import { useMemo, type ReactNode } from 'react';
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
  type BrokerCoverage,
  type CostStats,
  type ExpiryRow,
  type InstrumentRow,
  type LoadRow,
  type SequenceRow,
  type SizingStats,
  type TiltStats,
} from '../../utils/brokerAnalytics';
import { panelImpact } from '../../utils/performanceVerdict';
import { effectivePnl } from '../../utils/tradeHelpers';
import { BarRow, PanelShell, type PanelFigure } from './PanelShell';
import { tradesMeta } from '../../utils/panelCopy';
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

/** The header figure for a P&L: signed, coloured by sign. */
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

/* ------------------------------------------------------------------ sizing */

function SizingPanel({ data, currency, featured }: { data: SizingStats; currency: Currency } & PanelProps) {
  const backwards = data.ratio > 1.15;
  /* Per trade, not in total. On a journal where both halves lose money, comparing the totals says
     the small trades are the bigger problem purely because there are three times as many of them,
     which is the opposite of the truth. */
  const bigOnesCostMore =
    data.biggestQuarterPerTrade < 0 && data.biggestQuarterPerTrade < data.restPerTrade * 1.5;

  return (
    <PanelShell
      eyebrow="Size"
      title="Where the money goes"
      icon={<Scale size={14} />}
      featured={featured}
      figure={moneyFigure(data.biggestQuarterNet, currency, 'Biggest quarter of positions')}
      note={
        bigOnesCostMore ? (
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
        )
      }
    >
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
              · {formatCurrency(data.biggestQuarterPerTrade, currency)}/trade
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
              · {formatCurrency(data.restPerTrade, currency)}/trade
            </span>
          </span>
        </div>
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ tilt */

/**
 * Closer than this, as a share of the larger average, and the two are "about the same". Below it
 * the panel used to say "you trade the same" over a $36 gap, which contradicted its own figures.
 */
const SAME_WITHIN = 0.1;

export function TiltPanel({ data, currency, featured }: { data: TiltStats; currency: Currency } & PanelProps) {
  const tilts = data.delta < 0;
  const scale = Math.max(Math.abs(data.afterLossAvg), Math.abs(data.afterWinAvg), 1);
  const same = Math.abs(data.delta) <= scale * SAME_WITHIN;

  return (
    <PanelShell
      eyebrow="Discipline"
      title="The trade after a loss"
      icon={<TrendingDown size={14} />}
      featured={featured}
      figure={{
        value: `${data.delta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(data.delta), currency)}`,
        tone: tilts ? 'loss' : 'profit',
        caption: 'After a loss vs after a win',
      }}
      note={
        tilts && !same ? (
          <>
            The trade you take straight after a red one is worth{' '}
            <span className="text-loss-bright font-medium">
              {formatCurrency(Math.abs(data.delta), currency)}
            </span>{' '}
            less than the one after a green one. That gap is the cost of trading angry, and a
            five-minute rule after a loss is the cheapest fix in this journal.
          </>
        ) : same ? (
          <>
            You trade about the same after a loss as after a win — the gap is only{' '}
            {formatCurrency(Math.abs(data.delta), currency)}. Whatever is costing you, it is not tilt.
          </>
        ) : (
          <>
            The trade after a loss is worth{' '}
            <span className="text-profit-bright font-medium">{formatCurrency(data.delta, currency)}</span>{' '}
            more than the one after a win. Losing does not rattle you — if anything you tighten up
            afterwards. Whatever is costing you, it is not tilt.
          </>
        )
      }
    >
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

/* ------------------------------------------------------------------ expiry */

function ExpiryPanel({ rows, currency, featured }: { rows: ExpiryRow[]; currency: Currency } & PanelProps) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const worst = rows.reduce((a, b) => (b.pnl < a.pnl ? b : a));
  const best = rows.reduce((a, b) => (b.pnl > a.pnl ? b : a));
  const lead = biggest(rows);

  return (
    <PanelShell
      eyebrow="Expiry"
      title="Time left when you opened"
      icon={<CalendarClock size={14} />}
      featured={featured}
      figure={moneyFigure(lead.pnl, currency, `${lead.label} contracts`)}
      note={
        best.label !== worst.label && worst.pnl < 0 ? (
          <>
            <span className="text-loss-bright font-medium">{worst.label}</span> contracts have cost you{' '}
            {formatCurrency(Math.abs(worst.pnl), currency)} across {worst.trades} trades, while{' '}
            <span className="text-profit-bright font-medium">{best.label}</span> made{' '}
            {formatCurrency(best.pnl, currency)}. Same trader, different instrument.
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
            labelWidth="w-16"
          />
        ))}
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ instruments */

function InstrumentPanel({ rows, currency, featured }: { rows: InstrumentRow[]; currency: Currency } & PanelProps) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  const trap = rows.find((r) => r.winRate >= 55 && r.pnl < 0);
  const lead = biggest(rows);

  return (
    <PanelShell
      eyebrow="Mix"
      title="Calls, puts and shares"
      icon={<Timer size={14} />}
      featured={featured}
      figure={moneyFigure(lead.pnl, currency, lead.label)}
      note={
        trap ? (
          <>
            <span className="text-loss-bright font-medium">{trap.label}</span> win{' '}
            {Math.round(trap.winRate)}% of the time and still lose money — the wins are too small for
            the losses.
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
            labelWidth="w-14"
          />
        ))}
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ cost */

function CostPanel({ data, currency, featured }: { data: CostStats; currency: Currency } & PanelProps) {
  const heavy = data.shareOfGross >= 20;

  return (
    <PanelShell
      eyebrow="Costs"
      title="What trading cost you"
      icon={<Coins size={14} />}
      featured={featured}
      figure={{ value: formatCurrency(data.fees, currency), tone: heavy ? 'loss' : 'neutral', caption: 'In fees' }}
      note={
        data.grossProfit <= 0 ? (
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
        )
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Figure label="Per trade" value={formatCurrency(data.perTrade, currency)} />
        <Figure
          label="Of gross profit"
          value={data.grossProfit > 0 ? `${data.shareOfGross.toFixed(0)}%` : '—'}
          tone={heavy ? 'loss' : 'neutral'}
        />
      </div>
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
 *
 * Ordered by money. Eight equal cards in a fixed order made a wall: the reader had to find the
 * $19,000 finding among the $360 ones. Now the panel worth the most sits first, full width and
 * drawn larger (see PanelShell's `featured`), and the rest follow in the order of what they cost.
 * The verdict above the section uses the same ranking, so the headline figure up there is the
 * featured card down here.
 */
export function BrokerInsightSection({ trades }: { trades: Trade[] }) {
  const { settings } = useSettings();
  const coverage = useMemo(() => brokerCoverage(trades), [trades]);
  const currency = settings.currency;
  const net = useMemo(() => trades.reduce((sum, t) => sum + effectivePnl(t), 0), [trades]);

  const panels = useMemo(() => rankPanels(coverage, currency, net), [coverage, currency, net]);
  if (panels.length === 0) return null;

  const [lead, ...rest] = panels;

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      {lead!.render(true)}
      {rest.length > 0 && <div className="panel-grid">{rest.map((panel) => panel.render(false))}</div>}
    </div>
  );
}

interface RankedPanel {
  key: keyof BrokerCoverage;
  impact: number;
  render: (featured: boolean) => ReactNode;
}

/** Every panel with something to show, most money first. The order is tested through the markup. */
function rankPanels(coverage: BrokerCoverage, currency: Currency, net: number): RankedPanel[] {
  const panels: RankedPanel[] = [];
  const add = (key: keyof BrokerCoverage, render: RankedPanel['render']) =>
    panels.push({ key, impact: panelImpact(coverage, key, net), render });

  if (coverage.breakeven) add('breakeven', (f) => <BreakevenPanel key="breakeven" data={coverage.breakeven!} featured={f} />);
  if (coverage.sizing) add('sizing', (f) => <SizingPanel key="sizing" data={coverage.sizing!} currency={currency} featured={f} />);
  if (coverage.tilt) add('tilt', (f) => <TiltPanel key="tilt" data={coverage.tilt!} currency={currency} featured={f} />);
  if (coverage.sequence.length > 1) add('sequence', (f) => <SequencePanel key="sequence" rows={coverage.sequence} currency={currency} featured={f} />);
  if (coverage.load.length > 1) add('load', (f) => <LoadPanel key="load" rows={coverage.load} currency={currency} featured={f} />);
  if (coverage.expiry.length > 1) add('expiry', (f) => <ExpiryPanel key="expiry" rows={coverage.expiry} currency={currency} featured={f} />);
  if (coverage.instruments.length > 1) add('instruments', (f) => <InstrumentPanel key="instruments" rows={coverage.instruments} currency={currency} featured={f} />);
  if (coverage.cost) add('cost', (f) => <CostPanel key="cost" data={coverage.cost!} currency={currency} featured={f} />);

  // Stable for ties, so two panels worth the same keep their documented order.
  return panels
    .map((panel, i) => ({ panel, i }))
    .sort((a, b) => b.panel.impact - a.panel.impact || a.i - b.i)
    .map(({ panel }) => panel);
}
