import { useMemo } from 'react';
import { CandlestickChart, Clock, Crosshair, ListChecks, Ruler, Tags } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { PanelShell } from './PanelShell';
import { pnlClass } from '../../utils/pnlTone';
import {
  executionCoverage,
  hasAnyExecutionData,
  type DisciplineStats,
  type ExcursionStats,
  type ExpectancyStats,
  type HourlyBreakdown,
  type TagRow,
} from '../../utils/executionAnalytics';

type Currency = Parameters<typeof formatCurrency>[1];

/**
 * The panels for data the journal collects and never showed back.
 *
 * Each one renders only when it has a real sample behind it, and the section as a whole renders
 * nothing when none of them do. The empty version of a panel is not a panel: the Performance
 * screen used to draw five dashed cards for the five fields a Schwab import doesn't carry, which
 * is a paid page mostly made of things it can't do. What to record instead is still said — it is
 * said once, compactly, at the bottom, by ExecutionPrompts.
 *
 * Entry times were meant to be the exception here, since the SnapTrade importer records them when
 * the brokerage sends one. Several brokerages send a date with no clock on it at all, so for their
 * users this panel is in the same position as the rest, and the prompt says so honestly.
 */
interface ExecutionSectionProps {
  trades: Trade[];
}

/* ------------------------------------------------------------------ time of day */

function HourPanel({ data, currency }: { data: HourlyBreakdown; currency: Currency }) {
  const maxAbs = Math.max(...data.rows.map((r) => Math.abs(r.pnl)), 1);

  return (
    <PanelShell eyebrow="Timing" title="P&L by hour entered" icon={<Clock size={14} />}>
      <div className="space-y-1">
        {data.rows.map((row) => {
          const traded = row.trades > 0;
          const widthPct = (Math.abs(row.pnl) / maxAbs) * 100;
          return (
            <div key={row.hour} className={`flex items-center gap-1.5 ${traded ? '' : 'opacity-40'}`}>
              <span className="text-[10px] text-text-secondary w-8 shrink-0 text-right">{row.label}</span>
              <div
                className={`flex-1 h-3 rounded-full overflow-hidden relative ${
                  traded ? 'bg-bg-primary' : 'border border-dashed border-border/40'
                }`}
              >
                {row.pnl !== 0 && (
                  <div
                    className={`h-full rounded-full chart-bar-h ${row.pnl >= 0 ? 'bar-profit-h' : 'bar-loss-h'}`}
                    style={{ width: `${Math.max(widthPct, 3)}%` }}
                  />
                )}
              </div>
              <span
                className={`text-[10px] tabular-nums w-14 shrink-0 text-right ${
                  traded ? pnlClass(row.pnl) : 'text-text-secondary'
                }`}
              >
                {traded ? formatCurrency(row.pnl, currency) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* The sentence the panel exists to produce. Suppressed when one hour is both, which happens
          on a day with a single trading window and would read as nonsense. */}
      {data.best.hour !== data.worst.hour && (
        <p className="text-[10px] text-text-secondary mt-2.5 leading-relaxed">
          Best around <span className="text-profit-bright font-medium">{data.best.label}</span>, worst
          around <span className="text-loss-bright font-medium">{data.worst.label}</span>, across{' '}
          {data.covered} timed trade{data.covered === 1 ? '' : 's'}.
        </p>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ expectancy */

function ExpectancyPanel({ data }: { data: ExpectancyStats }) {
  const positive = data.expectancy >= 0;

  return (
    <PanelShell eyebrow="Edge" title="Expectancy in R" icon={<Crosshair size={14} />}>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-2xl md:text-3xl font-semibold tabular-nums ${pnlClass(data.expectancy)}`}>
          {positive ? '+' : ''}
          {data.expectancy.toFixed(2)}R
        </span>
        <span className="text-[10px] text-text-secondary">per trade</span>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Avg win', value: `+${data.avgWinR.toFixed(2)}R`, cls: 'text-profit-bright' },
          { label: 'Avg loss', value: `${data.avgLossR.toFixed(2)}R`, cls: 'text-loss-bright' },
          { label: 'Win rate', value: `${Math.round(data.winRate)}%`, cls: 'text-text-primary' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-bg-primary/60 py-2">
            <dt className="text-[9px] uppercase tracking-wide text-text-secondary">{item.label}</dt>
            <dd className={`text-xs md:text-sm font-semibold tabular-nums ${item.cls}`}>{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[10px] text-text-secondary mt-2.5 leading-relaxed">
        {positive
          ? `Every trade is worth ${data.expectancy.toFixed(2)}R on average — the edge holds over ${data.covered} trades with a recorded risk.`
          : `The average trade loses ${Math.abs(data.expectancy).toFixed(2)}R across ${data.covered} trades, whatever the win rate says.`}
      </p>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ excursions */

function ExcursionPanel({ data, currency }: { data: ExcursionStats; currency: Currency }) {
  const stopTooTight = data.avgMaeWinners > 0 && data.avgMaeWinners >= data.avgMaeLosers * 0.9;
  const leftOnTable = data.avgMfeLosers > 0;

  return (
    <PanelShell eyebrow="Excursion" title="How far trades ran" icon={<Ruler size={14} />}>
      <dl className="grid grid-cols-2 gap-2">
        {[
          { label: 'Winners went against you', value: data.avgMaeWinners },
          { label: 'Losers went against you', value: data.avgMaeLosers },
          { label: 'Winners ran for you', value: data.avgMfeWinners },
          { label: 'Losers ran for you first', value: data.avgMfeLosers },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-bg-primary/60 p-2">
            <dt className="text-[9px] text-text-secondary leading-tight">{item.label}</dt>
            <dd className="text-xs md:text-sm font-semibold tabular-nums mt-0.5">
              {formatCurrency(item.value, currency)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-[10px] text-text-secondary mt-2.5 leading-relaxed">
        {stopTooTight
          ? 'Your winners dip about as far as your losers do before working — a tighter stop would have cut them too.'
          : leftOnTable
            ? `Losing trades were up ${formatCurrency(data.avgMfeLosers, currency)} on average before turning. That is the exit, not the entry.`
            : 'Adverse and favourable excursion across the trades that recorded them.'}
      </p>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ discipline */

const GRADE_CLASS: Record<string, string> = {
  A: 'bg-profit-bright/20 text-profit-bright',
  B: 'bg-profit-bright/10 text-profit-bright',
  C: 'bg-bg-primary text-text-secondary',
  D: 'bg-loss-bright/10 text-loss-bright',
  F: 'bg-loss-bright/20 text-loss-bright',
};

function DisciplinePanel({ data, currency }: { data: DisciplineStats; currency: Currency }) {
  const both = data.followedPerTrade !== null && data.ignoredPerTrade !== null;
  const disciplinePays = both && data.followedPerTrade! > data.ignoredPerTrade!;

  return (
    <PanelShell eyebrow="Discipline" title="Did following the plan pay?" icon={<ListChecks size={14} />}>
      {data.grades.length > 0 && (
        <div className="space-y-1 mb-2.5">
          {data.grades.map((row) => (
            <div key={row.grade} className="flex items-center gap-2">
              <span
                className={`text-[10px] font-semibold w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                  GRADE_CLASS[row.grade] ?? 'bg-bg-primary text-text-secondary'
                }`}
              >
                {row.grade}
              </span>
              <span className="text-[10px] text-text-secondary flex-1">
                {row.trades} trade{row.trades === 1 ? '' : 's'} · {Math.round(row.winRate)}% won
              </span>
              <span className={`text-[10px] md:text-xs font-semibold tabular-nums ${pnlClass(row.pnl)}`}>
                {formatCurrency(row.pnl, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {both && (
        <div className="rounded-lg bg-bg-primary/60 p-2.5">
          <p className="text-[10px] text-text-secondary mb-1">Average per trade</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px]">
              Checklist followed
              <span className="text-text-secondary"> ({data.followedCount})</span>
            </span>
            <span className={`text-xs font-semibold tabular-nums ${pnlClass(data.followedPerTrade!)}`}>
              {formatCurrency(data.followedPerTrade!, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 mt-1">
            <span className="text-[10px]">
              Checklist ignored
              <span className="text-text-secondary"> ({data.ignoredCount})</span>
            </span>
            <span className={`text-xs font-semibold tabular-nums ${pnlClass(data.ignoredPerTrade!)}`}>
              {formatCurrency(data.ignoredPerTrade!, currency)}
            </span>
          </div>
          <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
            {disciplinePays
              ? 'Sticking to the checklist is worth money here, which is the argument for keeping it.'
              : 'The trades that ignored the checklist did better. Either the rules need changing, or this is a small sample being read too hard.'}
          </p>
        </div>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ setups */

function TagPanel({
  rows,
  currency,
  eyebrow = 'Setups',
  title = 'Which setups make money',
  icon,
  noun = 'setup',
}: {
  rows: TagRow[];
  currency: Currency;
  eyebrow?: string;
  title?: string;
  icon?: React.ReactNode;
  noun?: string;
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  // Something you win on most of the time and still lose money to is the finding worth surfacing.
  const trap = rows.find((r) => r.winRate >= 55 && r.pnl < 0);

  return (
    <PanelShell eyebrow={eyebrow} title={title} icon={icon ?? <Tags size={14} />}>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.tag} className="flex items-center gap-2">
            <span className="text-[10px] text-text-primary w-20 md:w-24 shrink-0 truncate" title={row.tag}>
              {row.tag}
            </span>
            <div className="flex-1 h-3 rounded-full overflow-hidden bg-bg-primary relative">
              <div
                className={`h-full rounded-full chart-bar-h ${row.pnl >= 0 ? 'bar-profit-h' : 'bar-loss-h'}`}
                style={{ width: `${Math.max((Math.abs(row.pnl) / maxAbs) * 100, 3)}%` }}
              />
            </div>
            <span className="text-[9px] text-text-secondary w-14 shrink-0 text-right tabular-nums">
              {row.trades}t · {Math.round(row.winRate)}%
            </span>
            <span className={`text-[10px] md:text-xs font-semibold tabular-nums w-16 shrink-0 text-right ${pnlClass(row.pnl)}`}>
              {formatCurrency(row.pnl, currency)}
            </span>
          </div>
        ))}
      </div>

      {trap && (
        <p className="text-[10px] text-text-secondary mt-2.5 leading-relaxed">
          <span className="text-loss-bright font-medium">{trap.tag}</span> wins{' '}
          {Math.round(trap.winRate)}% of the time and still loses money — the wins are too small for
          the losses. Worth a hard look at that {noun}.
        </p>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ section */

export function ExecutionSection({ trades }: ExecutionSectionProps) {
  const { settings } = useSettings();
  const coverage = useMemo(() => executionCoverage(trades), [trades]);

  if (!hasAnyExecutionData(coverage)) return null;

  const currency = settings.currency;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
      {/* Symbols first: it needs nothing but a ticker and a P&L, so it is the one panel here that
          draws for every journal from every source. */}
      {coverage.symbols.length > 0 && (
        <TagPanel
          rows={coverage.symbols}
          currency={currency}
          eyebrow="Symbols"
          title="Which tickers make money"
          icon={<CandlestickChart size={14} />}
          noun="ticker"
        />
      )}
      {coverage.hourly && <HourPanel data={coverage.hourly} currency={currency} />}
      {coverage.tags.length > 0 && <TagPanel rows={coverage.tags} currency={currency} />}
      {coverage.expectancy && <ExpectancyPanel data={coverage.expectancy} />}
      {coverage.excursions && <ExcursionPanel data={coverage.excursions} currency={currency} />}
      {coverage.discipline && <DisciplinePanel data={coverage.discipline} currency={currency} />}
    </div>
  );
}

interface Prompt {
  id: string;
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  needs: string;
}

/**
 * What is still missing, and what one field would unlock it.
 *
 * These used to be five full dashed cards sitting in the same grid as the real panels, which is
 * how a screen with one filled panel and five empty ones reads as a broken product rather than an
 * incomplete journal. They are prompts, so they are drawn as prompts — small, at the bottom, under
 * a heading that says what they are, and only for the fields that are actually absent.
 */
export function ExecutionPrompts({ trades }: ExecutionSectionProps) {
  const coverage = useMemo(() => executionCoverage(trades), [trades]);

  const prompts: Prompt[] = [];
  if (!coverage.hourly) {
    prompts.push({
      id: 'hourly',
      eyebrow: 'Timing',
      title: 'P&L by hour entered',
      icon: <Clock size={14} />,
      needs:
        'Needs a clock time on at least five entries. Some brokers send it with the fill and some send only the date — where yours does not, the time field on the trade form fills this in.',
    });
  }
  if (coverage.tags.length === 0) {
    prompts.push({
      id: 'tags',
      eyebrow: 'Setups',
      title: 'Which setups make money',
      icon: <Tags size={14} />,
      needs:
        'Needs a setup or tag on at least three trades of the same kind. Tag them as you review and this fills in within a week.',
    });
  }
  if (!coverage.expectancy) {
    prompts.push({
      id: 'expectancy',
      eyebrow: 'Edge',
      title: 'Expectancy in R',
      icon: <Crosshair size={14} />,
      needs:
        'Needs the R multiple on at least five trades — the result in units of the risk you took. Your breakeven win rate above is the version of this that needs nothing.',
    });
  }
  if (!coverage.excursions) {
    prompts.push({
      id: 'excursions',
      eyebrow: 'Excursion',
      title: 'How far trades ran',
      icon: <Ruler size={14} />,
      needs:
        'Needs MAE and MFE — how far a trade went against you, and how far it ran in your favour. Together they say whether the stop or the exit is what is costing you.',
    });
  }
  if (!coverage.discipline) {
    prompts.push({
      id: 'discipline',
      eyebrow: 'Discipline',
      title: 'Did following the plan pay?',
      icon: <ListChecks size={14} />,
      needs:
        'Needs a grade or a checklist score on at least five trades. Grading takes a second per trade and answers the hardest question there is: whether your rules make money.',
    });
  }

  if (prompts.length === 0) return null;

  return (
    <div className="panel-card p-3 md:p-4">
      <p className="text-[10px] uppercase tracking-widest text-text-secondary/70 font-medium mb-0.5">
        Record these and more opens up
      </p>
      <h3 className="text-sm font-semibold mb-3">
        {prompts.length} more panel{prompts.length === 1 ? '' : 's'} the journal can draw
      </h3>
      <ul className="grid gap-2 md:grid-cols-2">
        {prompts.map((prompt) => (
          <li
            key={prompt.id}
            className="rounded-lg border border-dashed border-border/60 p-2.5 flex gap-2.5"
          >
            <span className="text-text-secondary/70 mt-0.5 shrink-0">{prompt.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary">{prompt.title}</p>
              <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">{prompt.needs}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
