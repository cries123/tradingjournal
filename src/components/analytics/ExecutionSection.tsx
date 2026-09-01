import { useMemo } from 'react';
import { CandlestickChart, Clock, Crosshair, ListChecks, Ruler, Tags } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
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
 * nothing when none of them do. That rule is the reason this exists at all: the old Timing and
 * Execution cards were pulled because they showed an empty state to every broker-sync user, who
 * has no entry price risk, no MAE and no self-assigned grade. Empty cards are worse than absent
 * ones — they make a full product look broken.
 *
 * Entry times are the exception and the reason the time panel usually appears: the SnapTrade
 * importer records them, so hour-of-day works for synced traders without them typing anything.
 */
interface ExecutionSectionProps {
  trades: Trade[];
  /**
   * Show a panel that has no data yet, as a prompt for what to record.
   *
   * Off on any surface somebody landed on for another reason — that is what made the old Timing
   * and Execution cards read as a broken dashboard. On a screen you navigated to in order to look
   * at your execution, the opposite is true: a missing panel is the most useful thing on the page,
   * because it names the one field that would unlock it.
   */
  showPrompts?: boolean;
}

function PanelShell({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-card p-3 md:p-4 flex flex-col min-h-[160px]">
      <div className="mb-2 md:mb-3 shrink-0 flex items-start gap-2">
        <span className="text-accent/80 mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
            {eyebrow}
          </p>
          <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">{title}</h3>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

function pnlClass(value: number): string {
  return value >= 0 ? 'text-profit-bright' : 'text-loss-bright';
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

function LockedPanel({
  eyebrow,
  title,
  icon,
  needs,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  needs: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 p-3 md:p-4 flex flex-col min-h-[160px]">
      <div className="mb-2 md:mb-3 shrink-0 flex items-start gap-2 opacity-60">
        <span className="text-text-secondary mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-secondary font-medium mb-0.5">
            {eyebrow}
          </p>
          <h3 className="text-[10px] md:text-sm font-semibold text-text-secondary">{title}</h3>
        </div>
      </div>
      <div className="flex-1 flex items-center">
        <p className="text-xs text-text-secondary leading-relaxed">{needs}</p>
      </div>
    </div>
  );
}

export function ExecutionSection({ trades, showPrompts = false }: ExecutionSectionProps) {
  const { settings } = useSettings();
  const coverage = useMemo(() => executionCoverage(trades), [trades]);

  if (!showPrompts && !hasAnyExecutionData(coverage)) return null;

  const currency = settings.currency;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
      {coverage.hourly ? (
        <HourPanel data={coverage.hourly} currency={currency} />
      ) : (
        showPrompts && (
          <LockedPanel
            eyebrow="Timing"
            title="P&L by hour entered"
            icon={<Clock size={14} />}
            needs="Needs an entry time on at least five trades. Broker imports fill this in automatically — for hand-typed trades it is the time field on the trade form."
          />
        )
      )}

      {/* Symbols first among the always-available panels: it needs nothing but a ticker and a
          P&L, so it is the one thing on this screen that draws for every journal. */}
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

      {coverage.tags.length > 0 ? (
        <TagPanel rows={coverage.tags} currency={currency} />
      ) : (
        showPrompts && (
          <LockedPanel
            eyebrow="Setups"
            title="Which setups make money"
            icon={<Tags size={14} />}
            needs="Needs a setup or tag on at least three trades of the same kind. Tag them as you review and this fills in within a week."
          />
        )
      )}

      {coverage.expectancy ? (
        <ExpectancyPanel data={coverage.expectancy} />
      ) : (
        showPrompts && (
          <LockedPanel
            eyebrow="Edge"
            title="Expectancy in R"
            icon={<Crosshair size={14} />}
            needs="Needs the R multiple on at least five trades — what the result was in units of the risk you took. It is the number that says whether the edge is real."
          />
        )
      )}

      {coverage.excursions ? (
        <ExcursionPanel data={coverage.excursions} currency={currency} />
      ) : (
        showPrompts && (
          <LockedPanel
            eyebrow="Excursion"
            title="How far trades ran"
            icon={<Ruler size={14} />}
            needs="Needs MAE and MFE — how far a trade went against you, and how far it ran in your favour. Together they say whether the stop or the exit is what is costing you."
          />
        )
      )}

      {coverage.discipline ? (
        <DisciplinePanel data={coverage.discipline} currency={currency} />
      ) : (
        showPrompts && (
          <LockedPanel
            eyebrow="Discipline"
            title="Did following the plan pay?"
            icon={<ListChecks size={14} />}
            needs="Needs a grade or a checklist score on at least five trades. Grading takes a second per trade and answers the hardest question there is: whether your rules make money."
          />
        )
      )}
    </div>
  );
}
