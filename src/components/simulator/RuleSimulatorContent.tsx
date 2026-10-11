import { useMemo, useState } from 'react';
import { Check, FlaskConical } from 'lucide-react';
import type { Trade } from '../../types';
import type { TradingRules } from '../../types/strategy';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { rulesAreTestable, simulateRules, type SimulatedDay } from '../../utils/ruleSimulator';
import { PageFrame, PageSection } from '../layout/PageFrame';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CountUp } from '../motion/CountUp';

export interface SimulatorPeriod {
  scope: 'month' | 'year' | 'all';
  label: string;
  trades: Trade[];
}

interface RuleSimulatorContentProps {
  periods: SimulatorPeriod[];
  onBack: () => void;
}

/**
 * Below this, a rule's result is a coincidence.
 *
 * Four stopped days out of six is not evidence that a daily stop works, it is one bad Tuesday. The
 * screen still shows the number — hiding it would be worse — but it says plainly that the sample
 * is too thin to conclude from, the same way the Performance screen's MIN_SAMPLE gates do.
 */
const THIN_SAMPLE_DAYS = 20;

const STOP_LABEL: Record<NonNullable<SimulatedDay['stoppedBy']>['rule'], string> = {
  max_trades: 'trade cap',
  max_loss: 'daily loss limit',
  max_gain: "day's target",
  max_streak: 'losing streak',
};

/**
 * "Aug 27", from a YYYY-MM-DD key.
 *
 * Parsed by hand rather than through Date(key), which reads a bare date string as UTC midnight and
 * then prints it in local time — one timezone west of Greenwich and every row shows the day before.
 * That is the same trap the rule-standing tests fell into.
 */
function shortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "+$4,806.67" — the difference always carries its sign, gain or cost. */
function signedCurrency(n: number): string {
  return `${n >= 0 ? '+' : ''}${formatCurrency(n)}`;
}

/** Blank clears the rule rather than meaning zero — "" and 0 are different answers here. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The one screen that says what would have happened instead.
 *
 * Everything else here reports the past. This replays it against limits the trader did not keep,
 * which is the only version of "you overtrade" anybody acts on: their own days, their own money,
 * a number rather than advice.
 *
 * Numbers and a table, no chart — the dashboard's charts were removed deliberately in favour of
 * figures you can act on, and opening this screen with an equity curve would walk that back.
 *
 * Every figure comes from simulateRules. Nothing is recomputed here, so the screen cannot round or
 * count anything differently from the function that is under test.
 */
export function RuleSimulatorContent({ periods, onBack }: RuleSimulatorContentProps) {
  const { settings, updateSettings } = useSettings();

  /*
   * All time by default, NOT the month the dashboard happens to be showing.
   *
   * A rule is a claim about how you trade, and one month is six or eight stopped days — a sample
   * that produces a confident number and a different one next month. The month is still offered,
   * because "did my stop help in September" is a fair question, but it is not the answer somebody
   * should land on without choosing it.
   */
  const [scope, setScope] = useState<SimulatorPeriod['scope']>('all');
  const period = periods.find((p) => p.scope === scope) ?? periods[periods.length - 1];
  /* Memoised because `?? []` is a fresh array every render, which would make the simulation below
     re-run on every keystroke in a rule box rather than only when the rule or the period changes. */
  const trades = useMemo(() => period?.trades ?? [], [period]);

  // Seeded from the rules they already set, so the screen opens on their own limits rather than on
  // an invented example — and so "save" is usually a small change rather than a new decision.
  const [maxTrades, setMaxTrades] = useState(
    settings.tradingRules.maxTradesPerDay != null ? String(settings.tradingRules.maxTradesPerDay) : '',
  );
  const [maxLoss, setMaxLoss] = useState(
    settings.tradingRules.maxDailyLoss != null ? String(settings.tradingRules.maxDailyLoss) : '',
  );
  const [maxGain, setMaxGain] = useState(
    settings.tradingRules.maxDailyGain != null ? String(settings.tradingRules.maxDailyGain) : '',
  );
  const [maxStreak, setMaxStreak] = useState(
    settings.tradingRules.maxConsecutiveLosses != null
      ? String(settings.tradingRules.maxConsecutiveLosses)
      : '',
  );
  const [saved, setSaved] = useState(false);

  const rules: TradingRules = useMemo(
    () => ({
      enabled: true,
      ...(numberOrNull(maxTrades) != null ? { maxTradesPerDay: numberOrNull(maxTrades)! } : {}),
      ...(numberOrNull(maxLoss) != null ? { maxDailyLoss: numberOrNull(maxLoss)! } : {}),
      ...(numberOrNull(maxGain) != null ? { maxDailyGain: numberOrNull(maxGain)! } : {}),
      ...(numberOrNull(maxStreak) != null ? { maxConsecutiveLosses: numberOrNull(maxStreak)! } : {}),
    }),
    [maxTrades, maxLoss, maxGain, maxStreak],
  );

  const result = useMemo(() => simulateRules(trades, rules), [trades, rules]);
  const testable = rulesAreTestable(rules);
  const helped = result.difference > 0;

  const save = () => {
    updateSettings({ tradingRules: { ...rules, enabled: true } });
    setSaved(true);
  };

  return (
    <PageFrame
      sidebarDestination
      title="Rule simulator"
      icon={FlaskConical}
      onBack={onBack}
      subtitle="Your own trades, replayed against rules you set. Nothing here changes your journal."
      actions={
        /* Its own period, independent of what the dashboard is showing — asking "what would a stop
           have done to my year" should not mean navigating the calendar first. */
        <SegmentedControl
          label="Period"
          value={scope}
          onChange={setScope}
          options={periods.map((p) => ({ id: p.scope, label: p.label }))}
        />
      }
    >
      {trades.length === 0 ? (
        <section className="panel-card p-5">
          <p className="text-sm text-text-secondary">
            Nothing to replay yet — log or import some trades and this will show what a daily stop
            would have done to them.
          </p>
        </section>
      ) : (
        <>
          <section className="hero-card p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-secondary font-semibold">
              {testable ? 'If you had followed these rules' : 'Set a limit to see what it would have changed'}
            </p>

            <div className="relative flex flex-wrap items-end gap-x-10 gap-y-4 mt-3">
              <div>
                <p className="text-xs text-text-secondary">Actual</p>
                <p
                  className={`text-3xl md:text-4xl font-extrabold tabular-nums leading-none mt-1 ${
                    result.actualPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'
                  }`}
                >
                  <CountUp value={result.actualPnl} format={formatCurrency} from={0} />
                </p>
              </div>

              {testable && (
                <>
                  <div>
                    <p className="text-xs text-text-secondary">With these rules</p>
                    <p
                      className={`text-3xl md:text-4xl font-extrabold tabular-nums leading-none mt-1 ${
                        result.simulatedPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'
                      }`}
                    >
                      {/* Rolls from the old figure to the new one as a rule is typed, which is the
                          whole point of the screen: change the cap, watch the number move. */}
                      <CountUp value={result.simulatedPnl} format={formatCurrency} from={0} />
                    </p>
                  </div>
                  <div className={`rounded-lg px-4 py-2 ${helped ? 'bg-profit-bright/10' : 'bg-loss-bright/10'}`}>
                    <p className={`text-xs ${helped ? 'text-profit-bright/80' : 'text-loss-bright/80'}`}>
                      Difference
                    </p>
                    <p
                      className={`text-2xl font-bold tabular-nums leading-none mt-1 ${
                        helped ? 'text-profit-bright' : 'text-loss-bright'
                      }`}
                    >
                      <CountUp value={result.difference} format={signedCurrency} from={0} />
                    </p>
                  </div>
                </>
              )}
            </div>

            <p className="text-xs text-text-secondary mt-4 leading-relaxed">
              Across {result.tradingDays} trading {result.tradingDays === 1 ? 'day' : 'days'} and{' '}
              {result.totalTrades} trades. Once a day is stopped, every trade after it that day is
              removed along with its result — win or lose.
            </p>

            {testable && result.tradingDays > 0 && result.tradingDays < THIN_SAMPLE_DAYS && (
              /* Shown rather than the number being hidden: the figure is real, it just is not yet
                 evidence of anything. Saying so is the difference between a tool and a fortune
                 teller. */
              <p className="text-xs text-amber-300/90 mt-2 leading-relaxed">
                Only {result.tradingDays} trading days here — enough to see what happened, not
                enough to conclude a rule works. Try a longer period.
              </p>
            )}
          </section>

          {/*
            The four rules side by side rather than stacked down a 300px rail: on a wide screen that
            rail left the result table squeezed into what was left, and the rules are the controls —
            they belong at the top, next to the number they change.

            Time-of-day rules are said to be absent rather than left to be discovered. Schwab's feed
            carries a date with no fill time, so a time-of-day rule would silently simulate nothing for
            most journals here.
          */}
          <PageSection
            title="Rules to test"
            blurb="Time-of-day rules are not here: most brokers send the date without the fill time, so there is nothing to test them against."
          >
            <div className="grid gap-2 md:gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <RuleInput
                label="Max trades per day"
                blurb="Stop once you have taken this many, whatever happened."
                unit="trades"
                value={maxTrades}
                onChange={setMaxTrades}
              />
              <RuleInput
                label="Daily loss limit"
                blurb="Stop for the day once you are down this much."
                unit="dollars"
                value={maxLoss}
                onChange={setMaxLoss}
              />
              <RuleInput
                label="Stop after losses in a row"
                blurb="Stop for the day after this many losers back to back."
                unit="in a row"
                value={maxStreak}
                onChange={setMaxStreak}
              />
              <RuleInput
                label="Daily target"
                blurb="Stop once the day is up this much — the point you said you would walk."
                unit="dollars"
                value={maxGain}
                onChange={setMaxGain}
              />
            </div>
          </PageSection>

          <div
            className={`grid gap-2 md:gap-3 items-start ${
              result.changedDays.length > 0 && testable ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''
            }`}
          >
            {/* Second on a narrow screen, where the summary of what the rules did reads first. */}
            {result.changedDays.length > 0 && (
              <section className="panel-card p-5 order-2 xl:order-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                    Days it would have changed
                  </h2>
                  <span className="text-[11px] text-text-secondary">
                    {result.daysChanged} of {result.tradingDays}
                  </span>
                </div>

                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-text-secondary">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium text-right">Trades</th>
                        <th className="pb-2 font-medium text-right">Actual</th>
                        <th className="pb-2 font-medium text-right">Simulated</th>
                        {/* Five columns in 366px gave every row three wrapped lines and a 61px
                            height. On a phone this moves under the date instead, where it reads
                            as a sentence rather than a squeezed column. */}
                        <th className="hidden sm:table-cell pb-2 pl-4 font-medium">Stopped by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.changedDays.slice(0, 25).map((day) => (
                        <tr key={day.date} className="border-t border-border/50">
                          <td className="py-2.5 whitespace-nowrap">
                            {shortDate(day.date)}
                            {day.stoppedBy && (
                              <span className="block sm:hidden text-[10px] text-text-secondary font-normal">
                                {STOP_LABEL[day.stoppedBy.rule]}, trade {day.stoppedBy.atTrade}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-text-secondary">
                            {day.actualTrades} → {day.keptTrades}
                          </td>
                          <td
                            className={`py-2.5 text-right tabular-nums ${
                              day.actualPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'
                            }`}
                          >
                            {formatCurrency(day.actualPnl)}
                          </td>
                          <td
                            className={`py-2.5 text-right tabular-nums ${
                              day.simulatedPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'
                            }`}
                          >
                            {formatCurrency(day.simulatedPnl)}
                          </td>
                          <td className="hidden sm:table-cell py-2.5 pl-4 text-[11px] text-text-secondary">
                            {day.stoppedBy
                              ? `${STOP_LABEL[day.stoppedBy.rule]}, trade ${day.stoppedBy.atTrade}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.changedDays.length > 25 && (
                  <p className="mt-3 text-[11px] text-text-secondary">
                    Showing the 25 worst of {result.changedDays.length}.
                  </p>
                )}
              </section>
            )}

            {testable && (
              <div className="flex flex-col gap-2 md:gap-3 order-1 xl:order-2">
                <section className="panel-card p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                    What the rules did
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-4 mt-4">
                    <Stat label="Days cut short" value={String(result.daysChanged)} />
                    <Stat label="Trades removed" value={String(result.tradesRemoved)} />
                    <Stat
                      label="Winners given up"
                      value={`-${formatCurrency(result.winnersGivenUp)}`}
                      tone="text-loss-bright"
                    />
                    <Stat
                      label="Losses avoided"
                      value={`+${formatCurrency(result.lossesAvoided)}`}
                      tone="text-profit-bright"
                    />
                  </div>
                  {/* Both halves, always. A rule that stops a day removes its good trades too, and a
                      simulator that reported only the upside would be advertising rather than
                      testing — the first time somebody's own good afternoon vanished into it, they
                      would stop believing the screen. */}
                  <p className="text-xs text-text-secondary mt-4 leading-relaxed">
                    A rule this strict costs you real winners as well — that is the second number,
                    and it is why both are here. It is worth keeping when the losses avoided are the
                    bigger of the two.
                  </p>
                </section>

                <section className="panel-card border-profit-bright/25 p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                    Make it real
                  </h2>
                  {/* The loop the feature exists to close. Finding the number and then retyping it
                      in Settings is where a simulation stops changing anything. */}
                  <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
                    Saving these as your trading rules turns the simulation into the limits the
                    journal warns you about while you are trading.
                  </p>
                  <button
                    type="button"
                    onClick={save}
                    className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold mt-3"
                  >
                    {saved && <Check size={15} aria-hidden />}
                    {saved ? 'Saved as your trading rules' : 'Save as my trading rules'}
                  </button>
                </section>
              </div>
            )}
          </div>
        </>
      )}
    </PageFrame>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

function RuleInput({
  label,
  blurb,
  unit,
  value,
  onChange,
}: {
  label: string;
  blurb: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const on = numberOrNull(value) != null;
  return (
    <div className={`panel-card p-4 ${on ? 'border-profit-bright/30' : ''}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{blurb}</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="off"
          aria-label={label}
          className="w-24 min-w-0 rounded-lg border border-border bg-bg-tertiary px-2 py-1.5 text-sm focus-ring"
        />
        <span className="text-xs text-text-secondary">{unit}</span>
      </div>
    </div>
  );
}
