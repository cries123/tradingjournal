import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Play, Upload, X } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { useDayNote } from '../../hooks/useDayNote';
import { formatCurrency } from '../../utils/format';
import { computeStats } from '../../utils/stats';
import { tradesByDay } from '../../utils/tradingRules';
import { capReport, dayRuleLines, ordinal, runningTotals } from '../../utils/dayReport';
import { tradeLine } from '../../utils/tradeLine';
import { replayAvailable, replayAvailableAt } from '../../utils/marketReplay';
import { tradeTags, describeTradeForDeletion } from '../../utils/tradeHelpers';
import { ConfirmDialog } from '../ConfirmDialog';
import { ShareCardModal } from '../ShareCardModal';
import { DayChart } from './DayChart';

export interface DayContentProps {
  date: string;
  /** The trades the screens show — one journal, or every journal in the all-journals view. */
  trades: Trade[];
  /** The active journal's trades: what the rules are judged on. */
  ruleTrades: Trade[];
  /** Days a rule broke, for the month calendar's marks. */
  ruleDates?: ReadonlySet<string>;
  /** The desktop page, or the phone's sheet. */
  layout: 'page' | 'sheet';
  /** Back to the month (page) or closes the sheet. */
  onBack: () => void;
  onOpenDay: (date: string) => void;
  onEdit: (trade: Trade) => void;
  onDelete: (id: string) => void;
  onAddTrade: () => void;
  onImportCsv?: () => void;
  onOpenSimulator?: () => void;
  onOpenSettings?: () => void;
  /** Opens market replay on this day. Left out where the person cannot see replay at all. */
  onReplay?: () => void;
}

const NONE: ReadonlySet<string> = new Set();

/** "Replay opens Tue 4:15 PM", for a day too recent to replay yet. */
function replayOpensWords(date: string): string {
  const at = replayAvailableAt(date);
  return `Replay opens ${at.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })} ET`;
}

/** One to ten as words, the way the sentence would be said: "the three below cost…". */
function words(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
}

function longDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function price(n: number | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}

/**
 * One day of the journal, as a page: what happened, against your own rules, and what you wrote.
 *
 * It replaced a drawer that listed the day's trades under a note box. The page reads the day the
 * way the rules do — in order, with the running total after each trade, the point the cap was
 * passed and what the trades after it added up to — because "you broke your cap" is a verdict and
 * the chart under it is the evidence.
 *
 * The note is the same note, in the same place, saved by the same service as before; useDayNote
 * adds only the guarantees that nothing is written over a note that did not load, nothing is
 * re-saved unchanged, and an edit is saved when the trader leaves the day.
 */
export function DayContent(props: DayContentProps) {
  const { date, trades, ruleTrades, ruleDates = NONE, layout, onBack, onOpenDay, onEdit, onDelete, onAddTrade, onImportCsv, onOpenSimulator, onOpenSettings, onReplay } = props;
  const { settings, viewingAllJournals } = useSettings();
  const [now] = useState(() => Date.now());
  const replayReady = replayAvailable(date, new Date(now));
  const rules = settings.tradingRules;
  const note = useDayNote(date);
  const [pendingDelete, setPendingDelete] = useState<Trade | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  const days = useMemo(() => tradesByDay(trades), [trades]);
  const dayTrades = useMemo(() => days.get(date) ?? [], [days, date]);
  const ruleDay = useMemo(() => tradesByDay(ruleTrades).get(date) ?? [], [ruleTrades, date]);
  const points = useMemo(() => runningTotals(dayTrades), [dayTrades]);
  const stats = useMemo(() => computeStats(dayTrades), [dayTrades]);
  const judged = rules.enabled && !viewingAllJournals;
  const lines = useMemo(
    // Whole dollars where the figure is whole: a limit reads "Stop at −$500", not "−$500.00".
    () => (judged ? dayRuleLines(ruleDay, rules, (n) => formatCurrency(n, settings.currency).replace(/\.00$/, '')) : []),
    [judged, ruleDay, rules, settings.currency],
  );
  const cap = judged ? rules.maxTradesPerDay : undefined;
  const capped = useMemo(() => capReport(ruleDay, cap), [ruleDay, cap]);
  const lossLimit = judged && rules.maxDailyLoss ? Math.abs(rules.maxDailyLoss) : undefined;

  const dates = useMemo(() => [...days.keys()].sort(), [days]);
  const at = dates.indexOf(date);
  const prev = at > 0 ? dates[at - 1] : at === -1 ? [...dates].reverse().find((d) => d < date) : undefined;
  const next = at >= 0 && at < dates.length - 1 ? dates[at + 1] : at === -1 ? dates.find((d) => d > date) : undefined;

  const [y, m] = date.split('-').map(Number);
  const monthName = new Date(y, m - 1, 15).toLocaleDateString('en-US', { month: 'long' });
  // Days in this month the cap was passed — "this happened on 3 days in September".
  const cappedDays = useMemo(() => {
    if (!cap) return 0;
    const prefix = date.slice(0, 7);
    let n = 0;
    for (const [d, list] of tradesByDay(ruleTrades)) if (d.startsWith(prefix) && list.length > cap) n++;
    return n;
  }, [ruleTrades, cap, date]);

  const best = dayTrades.length ? Math.max(...points.map((p) => p.pnl)) : 0;
  const worst = dayTrades.length ? Math.min(...points.map((p) => p.pnl)) : 0;
  const anyTime = dayTrades.some((t) => Boolean(t.entryTime));
  const tone = (n: number) => (n >= 0 ? 'text-profit-bright' : 'text-loss-bright');
  const signed = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;
  const broken = lines.filter((l) => l.broken);

  const noteBox = (big: boolean) => (
    <>
      <textarea
        value={note.draft}
        onChange={(e) => note.setDraft(e.target.value)}
        onBlur={note.save}
        disabled={note.status !== 'ready'}
        rows={big ? 4 : 3}
        placeholder={note.status === 'loading' ? 'Loading your note…' : 'How did the session go? What worked, what will you do differently…'}
        aria-label="Notes for this day"
        className={`w-full resize-y rounded-[14px] border border-border bg-bg-tertiary px-3 py-3 leading-relaxed text-text-primary placeholder:text-text-secondary/60 focus-ring disabled:opacity-60 ${
          big ? 'min-h-[104px] text-[13.5px]' : 'min-h-[80px] text-[16px]'
        }`}
      />
      {note.status === 'error' && (
        /* Said plainly, because the fear here is the note being gone: it is not, it just did not load. */
        <p className="mt-2 flex items-center gap-2 text-xs text-amber-300">
          Couldn&apos;t load your note. It hasn&apos;t been changed.
          <button type="button" onClick={note.retry} className="underline focus-ring rounded">
            Try again
          </button>
        </p>
      )}
    </>
  );
  const saveText =
    note.saveStatus === 'saving' ? 'Saving…' : note.saveStatus === 'saved' ? 'Saved' : note.saveStatus === 'error' ? "Couldn't save — your text is still here" : '';

  const rowActions = (trade: Trade) => (
    <span className="flex items-center justify-end gap-0.5">
      <button type="button" onClick={() => onEdit(trade)} aria-label="Edit trade" className="rounded p-1 text-text-secondary hover:text-accent focus-ring">
        <Pencil size={13} />
      </button>
      <button type="button" onClick={() => setPendingDelete(trade)} aria-label="Delete trade" className="rounded p-1 text-text-secondary hover:text-loss-bright focus-ring">
        <X size={13} />
      </button>
    </span>
  );

  const dialogs = (
    <>
      {pendingDelete && (
        <ConfirmDialog
          title="Delete this trade?"
          message={describeTradeForDeletion(pendingDelete)}
          confirmLabel="Delete trade"
          cancelLabel="Keep it"
          danger
          onConfirm={() => {
            onDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {showShare && dayTrades.length > 0 && (
        <ShareCardModal period="day" stats={stats} dateKey={date} year={y} month={m - 1} onClose={() => setShowShare(false)} />
      )}
    </>
  );

  /* ───────────── The phone's sheet ───────────── */
  if (layout === 'sheet') {
    const visible = showAll ? points : points.slice(0, 3);
    return (
      <div className="flex flex-col">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] text-text-secondary">{new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}</p>
            <p className="text-[22px] font-extrabold">{shortDate(date)}</p>
          </div>
          {dayTrades.length > 0 && (
            <div className="text-right">
              <p className={`text-2xl font-extrabold tabular-nums ${tone(stats.netPnl)}`}>{fmt(stats.netPnl)}</p>
              <p className="text-xs tabular-nums text-text-secondary">
                {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'} · {stats.winningTrades}W {stats.losingTrades}L
              </p>
            </div>
          )}
        </div>

        {broken.length > 0 && (
          <div className="mt-3.5 flex flex-col gap-1.5 rounded-[14px] border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2.5 text-[13px] text-[#e8d3a0]">
            {broken.map((l) => (
              <div key={l.type} className="flex items-center gap-2">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-amber-400" aria-hidden />
                <span>
                  <b className="font-semibold text-amber-400">{l.label}.</b> {l.detail}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 mb-1.5 text-[13px] font-bold text-text-secondary">Trades</p>
        {dayTrades.length === 0 ? (
          <p className="text-sm text-text-secondary">No trades this day.</p>
        ) : (
          <>
            {visible.map((p) => {
              const line = tradeLine(p.trade);
              return (
                <div key={p.trade.id} className="grid grid-cols-[52px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-white/[0.06] py-2 text-sm">
                  <span className="tabular-nums text-text-secondary">{p.trade.entryTime?.slice(0, 5) ?? ordinal(p.position)}</span>
                  <button type="button" onClick={() => onEdit(p.trade)} className="truncate text-left focus-ring rounded">
                    {line.title}
                  </button>
                  <span className={`text-right font-bold tabular-nums ${tone(p.pnl)}`}>{fmt(p.pnl)}</span>
                  {rowActions(p.trade)}
                </div>
              );
            })}
            {!showAll && points.length > 3 && (
              <button type="button" onClick={() => setShowAll(true)} className="py-2 text-left text-[13px] text-accent focus-ring rounded">
                + {points.length - 3} more
              </button>
            )}
          </>
        )}

        <p className="mt-4 mb-1.5 flex items-baseline justify-between text-[13px] font-bold text-text-secondary">
          Journal <span className="text-[11px] font-normal">{saveText}</span>
        </p>
        {noteBox(false)}
        <div className="mt-3 flex items-center gap-3" role="radiogroup" aria-label="Discipline">
          <span className="text-[13px] text-text-secondary">Discipline</span>
          <span className="flex flex-1 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={note.discipline === n}
                aria-label={`${n} of 5`}
                disabled={note.status !== 'ready'}
                onClick={() => note.setDiscipline(note.discipline === n ? null : n)}
                className={`h-2 w-7 rounded-full focus-ring ${note.discipline != null && n <= note.discipline ? 'bg-amber-400' : 'bg-[#262626]'}`}
              />
            ))}
          </span>
          <span className="text-[13px] tabular-nums text-text-secondary">{note.discipline ?? '–'} / 5</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setShowShare(true)}
            disabled={dayTrades.length === 0}
            className="h-[46px] rounded-full border border-border text-sm text-text-secondary disabled:opacity-50 focus-ring"
          >
            Share day
          </button>
          <button type="button" onClick={onAddTrade} className="h-[46px] rounded-full bg-accent text-sm font-bold text-bg-primary focus-ring">
            + Log a trade
          </button>
        </div>
        {onReplay && (
          <button
            type="button"
            onClick={onReplay}
            disabled={!replayReady}
            className="mt-3 flex h-[46px] w-full items-center justify-center gap-1.5 rounded-full border border-accent/40 text-sm font-semibold text-accent disabled:border-border disabled:font-normal disabled:text-text-secondary focus-ring"
          >
            <Play size={14} aria-hidden />
            {replayReady ? 'Replay this day' : replayOpensWords(date)}
          </button>
        )}
        {onImportCsv && (
          <button type="button" onClick={onImportCsv} className="mt-3 inline-flex items-center justify-center gap-1.5 text-[13px] text-text-secondary focus-ring rounded">
            <Upload size={13} aria-hidden />
            Import a CSV for this day
          </button>
        )}
        {dialogs}
      </div>
    );
  }

  /* ───────────── The desktop page ───────────── */
  const navButton = 'inline-flex items-center gap-1 rounded-[9px] border border-border px-[11px] py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 focus-ring';
  return (
    <div className="flex flex-col gap-4 pb-2">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] pb-3 pt-0.5">
        <button type="button" onClick={onBack} className="text-[13px] text-accent focus-ring rounded">
          ‹ {monthName}
        </button>
        <h1 className="text-lg font-bold">{longDate(date)}</h1>
        <div className="flex gap-1.5">
          <button type="button" disabled={!prev} onClick={() => prev && onOpenDay(prev)} className={navButton}>
            <ChevronLeft size={13} aria-hidden />
            {prev ? shortDate(prev) : 'Earlier'}
          </button>
          <button type="button" disabled={!next} onClick={() => next && onOpenDay(next)} className={navButton}>
            {next ? shortDate(next) : 'Later'}
            <ChevronRight size={13} aria-hidden />
          </button>
        </div>
        <span className="flex-1" />
        {onReplay && (
          <button
            type="button"
            onClick={onReplay}
            disabled={!replayReady}
            title={replayReady ? undefined : replayOpensWords(date)}
            /* Its own class string when ready: an accent colour added after navButton's grey loses to
               it, because Tailwind orders the CSS, not the class list. */
            className={
              replayReady
                ? 'inline-flex items-center gap-1 rounded-[9px] border border-accent/40 px-[11px] py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 focus-ring'
                : navButton
            }
          >
            <Play size={12} aria-hidden />
            {replayReady ? 'Replay' : replayOpensWords(date)}
          </button>
        )}
        {onImportCsv && (
          <button type="button" onClick={onImportCsv} className={navButton}>
            <Upload size={12} aria-hidden />
            Import CSV
          </button>
        )}
        <button type="button" onClick={() => setShowShare(true)} disabled={dayTrades.length === 0} className={navButton}>
          Share day
        </button>
        <button type="button" onClick={onAddTrade} className="rounded-[9px] bg-accent px-[11px] py-1.5 text-xs font-bold text-bg-primary focus-ring">
          + Log trade
        </button>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="panel-card grid gap-5 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <p className="text-xs text-text-secondary">Day result</p>
              <p className={`mt-1.5 text-[40px] font-extrabold leading-[1.05] tracking-tight tabular-nums ${dayTrades.length ? tone(stats.netPnl) : 'text-text-secondary'}`}>
                {dayTrades.length ? fmt(stats.netPnl) : '—'}
              </p>
              <p className="mt-1.5 text-[13px] text-text-secondary">
                {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'} · {stats.winningTrades} won {stats.losingTrades} lost
              </p>
              {dayTrades.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Fact label="Best trade" value={signed(best)} tone={tone(best)} />
                  <Fact label="Worst trade" value={fmt(worst)} tone={tone(worst)} />
                  {capped && (
                    <>
                      <Fact label={`First ${words(capped.cap)}`} value={signed(capped.kept)} tone={tone(capped.kept)} />
                      <Fact label="After that" value={signed(capped.after)} tone={tone(capped.after)} />
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="mb-1 flex items-baseline gap-2.5 text-sm font-semibold">
                How the day went <small className="text-xs font-normal text-text-secondary">running total after each trade</small>
              </h2>
              {dayTrades.length > 0 ? (
                <DayChart points={points} cap={cap} lossLimit={lossLimit} fmt={fmt} />
              ) : (
                <p className="py-10 text-center text-sm text-text-secondary">No trades this day.</p>
              )}
            </div>
          </section>

          <section className="panel-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="flex items-baseline gap-2.5 text-sm font-semibold">
                Trades <small className="text-xs font-normal text-text-secondary">in the order you took them</small>
              </h2>
            </div>
            {dayTrades.length === 0 ? (
              <p className="text-sm text-text-secondary">No trades this day — log one or import a CSV for it.</p>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-[11px] text-text-secondary/70">
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-left font-medium">#</th>
                    {anyTime && <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-left font-medium">Time</th>}
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-left font-medium">Symbol</th>
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-right font-medium">Qty</th>
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-right font-medium">Entry</th>
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-right font-medium">Exit</th>
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-right font-medium">P&amp;L</th>
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-right font-medium">Day so far</th>
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px] text-left font-medium">Setup</th>
                    <th className="border-b border-white/[0.06] px-2.5 py-[7px]" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {points.flatMap((p) => {
                    const line = tradeLine(p.trade);
                    const past = cap != null && p.position > cap;
                    const rows = [];
                    if (capped && p.position === capped.cap + 1) {
                      rows.push(
                        <tr key="cap">
                          <td colSpan={anyTime ? 10 : 9} className="p-0">
                            <div className="border-y border-white/[0.06] border-t-amber-400/50 border-dashed bg-amber-400/[0.05] px-2.5 py-1.5 text-[11px] text-amber-300">
                              Your cap is {capped.cap} trades. The {words(capped.afterCount)} below {capped.after < 0 ? 'cost' : 'made'}{' '}
                              <b className="tabular-nums">{fmt(Math.abs(capped.after))}</b>.
                            </div>
                          </td>
                        </tr>,
                      );
                    }
                    rows.push(
                      <tr key={p.trade.id} className={past ? 'bg-amber-400/[0.035]' : ''}>
                        <td className="border-b border-white/[0.06] px-2.5 py-[11px] text-text-secondary">{ordinal(p.position)}</td>
                        {anyTime && <td className="border-b border-white/[0.06] px-2.5 py-[11px] tabular-nums text-text-secondary">{p.trade.entryTime?.slice(0, 5) ?? '—'}</td>}
                        <td className="whitespace-nowrap border-b border-white/[0.06] px-2.5 py-[11px] font-semibold">
                          {line.title}
                          {line.expiry && (
                            <span className={`ml-1 rounded-md px-1.5 py-px text-[10.5px] font-semibold ${line.kind === 'put' ? 'bg-loss-bright/15 text-loss-bright' : 'bg-accent/15 text-accent'}`}>
                              {line.expiry}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-white/[0.06] px-2.5 py-[11px] text-right tabular-nums">{p.trade.quantity ?? '—'}</td>
                        <td className="border-b border-white/[0.06] px-2.5 py-[11px] text-right tabular-nums">{price(p.trade.tradePrice)}</td>
                        <td className="border-b border-white/[0.06] px-2.5 py-[11px] text-right tabular-nums">{price(p.trade.exitPrice)}</td>
                        <td className={`whitespace-nowrap border-b border-white/[0.06] px-2.5 py-[11px] text-right tabular-nums ${tone(p.pnl)}`}>{signed(p.pnl)}</td>
                        <td className={`whitespace-nowrap border-b border-white/[0.06] px-2.5 py-[11px] text-right tabular-nums ${tone(p.running)}`}>{signed(p.running)}</td>
                        <td className="max-w-[140px] truncate border-b border-white/[0.06] px-2.5 py-[11px] text-text-secondary">{tradeTags(p.trade).join(', ') || '—'}</td>
                        <td className="border-b border-white/[0.06] px-1 py-[11px]">{rowActions(p.trade)}</td>
                      </tr>,
                    );
                    return rows;
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel-card p-4">
            <div className="mb-2 flex justify-between text-xs text-text-secondary">
              <span>Notes</span>
              <span>{saveText}</span>
            </div>
            {noteBox(true)}
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs text-text-secondary">
                <span>Followed my plan</span>
                <span className="tabular-nums">{note.discipline != null ? `${note.discipline} of 5` : 'Not rated'}</span>
              </div>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Followed my plan">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = note.discipline != null && n <= note.discipline;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={note.discipline === n}
                      disabled={note.status !== 'ready'}
                      onClick={() => note.setDiscipline(note.discipline === n ? null : n)}
                      className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg border text-xs focus-ring disabled:opacity-50 ${
                        on ? 'border-amber-400/50 bg-amber-400/15 font-bold text-amber-300' : 'border-border text-text-secondary'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="panel-card p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="flex items-baseline gap-2.5 text-sm font-semibold">
                Rules {judged && lines.length > 0 && <small className="text-xs font-normal text-text-secondary">broke {broken.length} of {lines.length}</small>}
              </h2>
              {onOpenSettings && (
                <button type="button" onClick={onOpenSettings} className="text-xs text-accent focus-ring rounded">
                  Edit rules
                </button>
              )}
            </div>
            {viewingAllJournals ? (
              <p className="text-[13px] text-text-secondary">Your limits are set per journal. Pick one to see this day against them.</p>
            ) : !rules.enabled || lines.length === 0 ? (
              <p className="text-[13px] text-text-secondary">No limits set. A trade cap or a daily loss limit shows here, passed or broken, for every day.</p>
            ) : (
              lines.map((l, i) => (
                <div key={l.type} className={`grid grid-cols-[20px_minmax(0,1fr)] gap-2 py-2.5 text-[13px] ${i > 0 ? 'border-t border-white/[0.06]' : 'pt-0.5'}`}>
                  <span
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-extrabold ${
                      l.broken ? 'bg-loss-bright/15 text-loss-bright' : 'bg-accent/15 text-accent'
                    }`}
                    aria-label={l.broken ? 'Broken' : 'Kept'}
                  >
                    {l.broken ? '✕' : '✓'}
                  </span>
                  <div>
                    {l.label}
                    <small className="mt-0.5 block text-xs text-text-secondary">{l.detail}</small>
                  </div>
                </div>
              ))
            )}
          </section>

          {capped && (
            <section className="panel-card p-4">
              <h2 className="text-[13px] font-medium text-text-secondary">If you had stopped at {words(capped.cap)}</h2>
              <p className="mt-1.5 text-[26px] font-extrabold tabular-nums">
                <span className={tone(capped.kept)}>{fmt(capped.kept)}</span>{' '}
                <span className="text-base font-semibold text-text-secondary">not {fmt(capped.actual)}</span>
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
                The trades after your cap {capped.after < 0 ? 'cost' : 'made'} <span className={tone(capped.after)}>{fmt(Math.abs(capped.after))}</span>.
                {cappedDays > 1 && ` This happened on ${cappedDays} days in ${monthName}.`}
              </p>
              {onOpenSimulator && (
                <button type="button" onClick={onOpenSimulator} className="mt-3 rounded-[9px] border border-border px-[11px] py-1.5 text-xs text-text-secondary hover:text-text-primary focus-ring">
                  Try a cap in the rule simulator
                </button>
              )}
            </section>
          )}

          <MonthCalendar date={date} days={days} ruleDates={ruleDates} onOpenDay={onOpenDay} fmt={fmt} />
        </aside>
      </div>
      {dialogs}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="text-[11.5px] text-text-secondary">
      {label}
      <b className={`mt-0.5 block text-[15px] tabular-nums ${tone}`}>{value}</b>
    </div>
  );
}

/** The month around the day, each traded day tinted by its result, for stepping to another day. */
function MonthCalendar({
  date,
  days,
  ruleDates,
  onOpenDay,
  fmt,
}: {
  date: string;
  days: Map<string, Trade[]>;
  ruleDates: ReadonlySet<string>;
  onOpenDay: (date: string) => void;
  fmt: (n: number) => string;
}) {
  const [y, m] = date.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const count = new Date(y, m, 0).getDate();
  const prefix = date.slice(0, 7);
  let total = 0;
  for (const [d, list] of days) if (d.startsWith(prefix)) total += list.reduce((s, t) => s + t.pnl, 0);
  const cells: (number | null)[] = [...Array<null>(first.getDay()).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];

  return (
    <section className="panel-card p-4">
      <h2 className="mb-2 flex items-baseline gap-2.5 text-sm font-semibold">
        {first.toLocaleDateString('en-US', { month: 'long' })}
        <small className={`text-xs font-normal tabular-nums ${total >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(total)}</small>
      </h2>
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <b key={i} className="pb-0.5 text-center text-[10px] font-medium text-text-secondary/70">
            {d}
          </b>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const key = `${prefix}-${String(day).padStart(2, '0')}`;
          const list = days.get(key);
          const net = list?.reduce((s, t) => s + t.pnl, 0) ?? 0;
          const current = key === date;
          return (
            <button
              key={key}
              type="button"
              onClick={list ? () => onOpenDay(key) : undefined}
              disabled={!list}
              title={list ? `${fmt(net)}${ruleDates.has(key) ? ' · broke a rule' : ''}` : undefined}
              className={`relative flex h-[30px] items-center justify-center rounded-[7px] text-[11px] focus-ring ${
                !list ? 'bg-[#0f0f0f] text-text-secondary/60' : net >= 0 ? 'bg-profit-bright/15 font-semibold text-profit-bright' : 'bg-loss-bright/15 font-semibold text-loss-bright'
              } ${current ? 'outline outline-[1.5px] -outline-offset-[1.5px] outline-text-primary' : ''}`}
            >
              {day}
              {ruleDates.has(key) && <span className="absolute right-[3px] top-[3px] h-1 w-1 rounded-full bg-amber-400" aria-hidden />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
