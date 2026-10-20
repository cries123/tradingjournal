import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, StickyNote } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { getMonthTrades, getYearTrades } from '../../utils/stats';
import { tradesByDay } from '../../utils/tradingRules';
import { tradeLine } from '../../utils/tradeLine';
import { describeTradeForDeletion, tradeTags } from '../../utils/tradeHelpers';
import { usualQuantity } from '../../utils/tradeContext';
import {
  dayIsOpen,
  filterTradeList,
  flipsForAll,
  isFiltering,
  NO_FILTERS,
  NO_SETUP,
  summarizeTradeList,
  type TradeListFilters,
} from '../../utils/tradeList';
import { SegmentedControl } from '../ui/SegmentedControl';
import { PeriodStepper } from '../overview/ToolbarControls';
import { ConfirmDialog } from '../ConfirmDialog';
import { TradeDetail } from './TradeDetail';
import { useAfterExitView } from '../../hooks/useTradePaths';

type Scope = 'month' | 'year' | 'all';

interface TradesContentProps {
  /** The trades the screens show — one journal, or every journal in the all-journals view. */
  trades: Trade[];
  /** The active journal's, for where a trade sat against the cap. */
  ruleTrades: Trade[];
  ruleDates: ReadonlySet<string>;
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrevYear: () => void;
  onNextYear: () => void;
  onOpenDay: (date: string) => void;
  onEdit: (trade: Trade) => void;
  onDelete: (id: string) => void;
  onImportCsv?: () => void;
  /** Export lives in Settings (backup and the tax-year file); the button goes there. */
  onExport?: () => void;
  /** Market replay is open to this account: measure what each contract did after the close. */
  measure?: boolean;
  /** Opens a day in market replay. */
  onReplay?: (date: string) => void;
}

/**
 * Days drawn before "Show earlier days". It was 4 while every day was drawn open, because one busy
 * day filled the screen. Closed days are one line each, so this is now the most trading days a
 * calendar month can hold: the Month view never hides a day, and Year and All time page by a month.
 */
const DAYS_SHOWN = 23;

function price(n: number | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}
function dayHeading(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
}

/**
 * Every trade in the period, as a list you can search, and one trade at a time beside it.
 *
 * The journal had no list of trades at all — they lived one day at a time in a drawer. This is the
 * desktop's ledger: filter to the losers, to the puts, to the days a rule broke or to the trades with
 * no setup (the ones the setup breakdowns cannot count), and read any one of them in full on the
 * right — where it sat in its day, whether it was bigger than usual, its setups and its note.
 * Each day folds to one line; which start open is decided in tradeList.ts.
 *
 * Nothing here writes. The note and the setups are shown as they are; Edit opens the trade in the
 * same form as everywhere else, so there is one way a note is changed and it is the tested one.
 */
export function TradesContent(props: TradesContentProps) {
  const { trades, ruleTrades, ruleDates, year, month, onPrevMonth, onNextMonth, onPrevYear, onNextYear, onOpenDay, onEdit, onDelete, onImportCsv, onExport, measure = false, onReplay } = props;
  const { settings, viewingAllJournals } = useSettings();
  const [scope, setScope] = useState<Scope>('month');
  const [filters, setFilters] = useState<TradeListFilters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(DAYS_SHOWN);
  const [pendingDelete, setPendingDelete] = useState<Trade | null>(null);
  /** Days opened or closed by hand, as flips of which days start open (see tradeList.ts). */
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const tone = (n: number) => (n >= 0 ? 'text-profit-bright' : 'text-loss-bright');

  const period = useMemo(
    () => (scope === 'month' ? getMonthTrades(trades, year, month) : scope === 'year' ? getYearTrades(trades, year) : trades),
    [scope, trades, year, month],
  );
  const shown = useMemo(() => filterTradeList(period, filters, ruleDates), [period, filters, ruleDates]);
  const summary = useMemo(() => summarizeTradeList(shown, ruleDates), [shown, ruleDates]);
  const days = useMemo(() => [...tradesByDay(shown).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)), [shown]);
  const setups = useMemo(() => [...new Set(period.flatMap(tradeTags))].sort(), [period]);
  const usual = useMemo(() => usualQuantity(ruleTrades), [ruleTrades]);
  const ruleDays = useMemo(() => tradesByDay(ruleTrades), [ruleTrades]);
  const ordered = useMemo(() => days.flatMap(([, list]) => list), [days]);
  const selected = ordered.find((t) => t.id === selectedId) ?? ordered[0] ?? null;
  const after = useAfterExitView(selected, measure);
  const anyTime = shown.some((t) => Boolean(t.entryTime));
  const periodLabel =
    scope === 'month' ? new Date(year, month, 15).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : scope === 'year' ? String(year) : 'All time';
  const journalName = viewingAllJournals ? 'All journals' : (settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'Journal');
  const set = (patch: Partial<TradeListFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setLimit(DAYS_SHOWN);
    setFlipped(new Set());
  };
  const newest = days[0]?.[0];
  const filtering = isFiltering(filters);
  const isOpen = (date: string) => dayIsOpen(date, newest, filtering, flipped);
  const toggle = (date: string) =>
    setFlipped((f) => {
      const next = new Set(f);
      if (!next.delete(date)) next.add(date);
      return next;
    });
  const allOpen = days.every(([date]) => isOpen(date));
  const cap = settings.tradingRules.enabled && !viewingAllJournals ? settings.tradingRules.maxTradesPerDay : undefined;
  const btn = 'inline-flex items-center gap-1.5 rounded-[9px] border border-border px-[11px] py-1.5 text-xs text-text-secondary hover:text-text-primary focus-ring';
  const select = 'appearance-none rounded-[9px] border border-border bg-transparent py-1.5 pl-[11px] pr-7 text-xs text-text-secondary hover:text-text-primary focus-ring';

  const step = (dir: -1 | 1) => {
    const i = selected ? ordered.indexOf(selected) : -1;
    const next = ordered[i + dir];
    if (!next) return;
    setSelectedId(next.id);
    // Stepping walks every trade listed, closed days and days not drawn yet included; open and
    // draw the day it lands in, or the trade on the right has no row in the list.
    if (!isOpen(next.date)) toggle(next.date);
    const at = days.findIndex(([date]) => date === next.date);
    if (at >= limit) setLimit(at + 1);
  };

  return (
    <div className="flex flex-col gap-3 pb-2 md:gap-4">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] pb-3 pt-0.5">
        <h1 className="text-lg font-bold">Trades</h1>
        <span className="text-[13px] text-text-secondary">
          {journalName} · <b className="font-medium text-text-primary">{periodLabel}</b>
        </span>
        {scope !== 'all' && (
          <PeriodStepper
            variant="desktop"
            label={periodLabel}
            noun={scope}
            onPrev={scope === 'month' ? onPrevMonth : onPrevYear}
            onNext={scope === 'month' ? onNextMonth : onNextYear}
          />
        )}
        <SegmentedControl
          label="Period"
          value={scope}
          onChange={(s) => {
            setScope(s);
            setLimit(DAYS_SHOWN);
            setFlipped(new Set());
          }}
          options={[
            { id: 'month', label: 'Month' },
            { id: 'year', label: 'Year' },
            { id: 'all', label: 'All time' },
          ]}
        />
        <span className="flex-1" />
        {onImportCsv && (
          <button type="button" onClick={onImportCsv} className={btn}>
            Import CSV
          </button>
        )}
        {onExport && (
          <button type="button" onClick={onExport} className={btn}>
            Export
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-[300px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/70" aria-hidden />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Search symbol, setup or note"
            aria-label="Search trades"
            className="w-full rounded-[10px] border border-border bg-bg-tertiary py-[7px] pl-8 pr-3 text-[16px] text-text-primary placeholder:text-text-secondary/60 focus-ring md:text-[12.5px]"
          />
        </label>
        <span className="relative"><select value={filters.result} onChange={(e) => set({ result: e.target.value as TradeListFilters['result'] })} aria-label="Result" className={select}>
          <option value="all">Result: all</option>
          <option value="won">Winners</option>
          <option value="lost">Losers</option>
        </select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden /></span>
        <span className="relative"><select value={filters.setup} onChange={(e) => set({ setup: e.target.value })} aria-label="Setup" className={select}>
          <option value="">Setup: any</option>
          <option value={NO_SETUP}>No setup</option>
          {setups.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden /></span>
        <span className="relative"><select value={filters.kind} onChange={(e) => set({ kind: e.target.value as TradeListFilters['kind'] })} aria-label="Calls and puts" className={select}>
          <option value="all">Calls and puts</option>
          <option value="calls">Calls</option>
          <option value="puts">Puts</option>
          <option value="shares">Shares</option>
        </select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden /></span>
        <button
          type="button"
          role="switch"
          aria-checked={filters.brokeOnly}
          onClick={() => set({ brokeOnly: !filters.brokeOnly })}
          className="ml-1.5 inline-flex items-center gap-2 text-xs text-text-secondary focus-ring rounded"
        >
          <span className={`relative h-[18px] w-[30px] rounded-full ${filters.brokeOnly ? 'bg-accent' : 'bg-[#2a2a2a]'}`} aria-hidden>
            <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full ${filters.brokeOnly ? 'left-[14px] bg-bg-primary' : 'left-[2px] bg-[#8a8a8a]'}`} />
          </span>
          Only days I broke a rule
        </button>
        {days.length > 1 && (
          <button type="button" onClick={() => setFlipped(flipsForAll(days.map(([date]) => date), !allOpen, newest, filtering))} className={`ml-auto ${btn}`}>
            {allOpen ? 'Collapse all days' : 'Expand all days'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-2 rounded-xl border border-white/[0.06] bg-bg-card px-4 py-3 text-xs text-text-secondary">
        <Stat label="Trades" value={String(summary.count)} />
        <Stat label="Won · lost" value={`${summary.won} · ${summary.lost}`} />
        <Stat label="Net" value={fmt(summary.net)} tone={summary.count ? tone(summary.net) : ''} />
        <Stat label="Biggest loss" value={summary.biggestLoss != null ? fmt(summary.biggestLoss) : '—'} tone={summary.biggestLoss != null ? 'text-loss-bright' : ''} />
        {!viewingAllJournals && settings.tradingRules.enabled && (
          <Stat label="Days that broke a rule" value={`${summary.brokeDays} of ${summary.days}`} tone={summary.brokeDays ? 'text-amber-300' : ''} />
        )}
        {summary.untagged > 0 && filters.setup !== NO_SETUP && (
          <span className="ml-auto flex items-center gap-2.5 text-[12.5px] text-text-primary">
            <span className="text-text-secondary">
              {summary.untagged} trade{summary.untagged === 1 ? ' has' : 's have'} no setup
            </span>
            <button type="button" onClick={() => set({ setup: NO_SETUP })} className={btn}>
              Tag them
            </button>
          </span>
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_372px]">
        <section className="panel-card overflow-x-auto px-1.5 pb-1 pt-1">
          {days.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">No trades match. Clear a filter or pick another period.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-[11px] text-text-secondary/70">
                  {anyTime && <th className="border-b border-white/[0.06] px-2.5 py-2 text-left font-medium">Time</th>}
                  <th className="border-b border-white/[0.06] px-2.5 py-2 text-left font-medium">Symbol</th>
                  <th className="border-b border-white/[0.06] px-2.5 py-2 text-right font-medium">Qty</th>
                  <th className="border-b border-white/[0.06] px-2.5 py-2 text-right font-medium">Entry</th>
                  <th className="border-b border-white/[0.06] px-2.5 py-2 text-right font-medium">Exit</th>
                  <th className="border-b border-white/[0.06] px-2.5 py-2 text-right font-medium">P&amp;L</th>
                  <th className="border-b border-white/[0.06] px-2.5 py-2 text-left font-medium">Setup</th>
                  <th className="border-b border-white/[0.06] px-2.5 py-2" aria-label="Flags" />
                </tr>
              </thead>
              <tbody>
                {days.slice(0, limit).flatMap(([date, list]) => {
                  const net = list.reduce((s, t) => s + t.pnl, 0);
                  const wins = list.filter((t) => t.pnl > 0).length;
                  const ruleDay = ruleDays.get(date) ?? [];
                  const open = isOpen(date);
                  // The divider keeps closed days, stacked header on header, from running together.
                  const head = 'border-b border-white/[0.06] bg-bg-tertiary px-2.5 py-2';
                  return [
                    // The whole row opens and closes the day; the chevron is the same thing as a
                    // button, for the keyboard and for screen readers.
                    <tr key={`d-${date}`} onClick={() => toggle(date)} className="group cursor-pointer">
                      <td colSpan={anyTime ? 5 : 4} className={`${head} text-xs font-semibold`}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(date);
                          }}
                          className="inline-flex items-center gap-1.5 rounded text-left focus-ring"
                        >
                          <ChevronRight
                            size={14}
                            aria-hidden
                            className={`shrink-0 text-text-secondary transition-transform duration-150 motion-reduce:transition-none group-hover:text-text-primary ${open ? 'rotate-90' : ''}`}
                          />
                          <span>
                            {dayHeading(date)}{' '}
                            <span className="font-normal text-text-secondary">
                              · {list.length} trade{list.length === 1 ? '' : 's'} · {wins} won {list.length - wins} lost
                            </span>
                            {ruleDates.has(date) && <span className="font-medium text-amber-300"> · broke a rule</span>}
                          </span>
                        </button>
                      </td>
                      <td className={`${head} text-right text-xs font-semibold tabular-nums ${tone(net)}`}>{fmt(net)}</td>
                      <td colSpan={2} className={`${head} text-right`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDay(date);
                          }}
                          className="whitespace-nowrap text-[11.5px] font-medium text-accent focus-ring rounded"
                        >
                          Open day
                        </button>
                      </td>
                    </tr>,
                    ...(open ? list : []).map((trade) => {
                      const line = tradeLine(trade);
                      const position = ruleDay.findIndex((t) => t.id === trade.id) + 1;
                      const pastCap = cap != null && position > cap;
                      const isSelected = selected?.id === trade.id;
                      return (
                        <tr
                          key={trade.id}
                          onClick={() => setSelectedId(trade.id)}
                          aria-selected={isSelected}
                          className={`cursor-pointer ${isSelected ? 'bg-accent/[0.07]' : 'hover:bg-white/[0.02]'}`}
                        >
                          {anyTime && (
                            <td className={`border-b border-white/[0.06] px-2.5 py-[9px] tabular-nums text-text-secondary ${isSelected ? 'shadow-[inset_3px_0_0_var(--color-accent)]' : ''}`}>
                              {trade.entryTime?.slice(0, 5) ?? '—'}
                            </td>
                          )}
                          <td className={`whitespace-nowrap border-b border-white/[0.06] px-2.5 py-[9px] font-semibold ${!anyTime && isSelected ? 'shadow-[inset_3px_0_0_var(--color-accent)]' : ''}`}>
                            {line.title}
                            {line.expiry && (
                              <span className={`ml-1.5 rounded-md px-1.5 py-px text-[10.5px] font-semibold ${line.kind === 'put' ? 'bg-loss-bright/15 text-loss-bright' : 'bg-accent/15 text-accent'}`}>
                                {line.expiry}
                              </span>
                            )}
                          </td>
                          <td className="border-b border-white/[0.06] px-2.5 py-[9px] text-right tabular-nums">{trade.quantity ?? '—'}</td>
                          <td className="border-b border-white/[0.06] px-2.5 py-[9px] text-right tabular-nums">{price(trade.tradePrice)}</td>
                          <td className="border-b border-white/[0.06] px-2.5 py-[9px] text-right tabular-nums">{price(trade.exitPrice)}</td>
                          <td className={`whitespace-nowrap border-b border-white/[0.06] px-2.5 py-[9px] text-right tabular-nums ${tone(trade.pnl)}`}>{fmt(trade.pnl)}</td>
                          <td className="max-w-[140px] truncate border-b border-white/[0.06] px-2.5 py-[9px] text-text-secondary">{tradeTags(trade).join(', ') || '—'}</td>
                          <td className="border-b border-white/[0.06] px-2.5 py-[9px]">
                            <span className="flex items-center gap-1.5">
                              {pastCap && (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/15 text-[10px] font-extrabold text-amber-300" title={`Past your ${cap}-trade cap`}>
                                  !
                                </span>
                              )}
                              {trade.notes?.trim() && <StickyNote size={14} className="text-text-secondary" aria-label="Has a note" />}
                            </span>
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          )}
          {days.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + DAYS_SHOWN)} className="px-2.5 pb-2 pt-3 text-xs text-accent focus-ring rounded">
              Show {Math.min(DAYS_SHOWN, days.length - limit)} earlier day{Math.min(DAYS_SHOWN, days.length - limit) === 1 ? '' : 's'}
            </button>
          )}
        </section>

        {selected && (
          <TradeDetail
            trade={selected}
            ruleTrades={ruleTrades}
            usual={usual}
            cap={cap}
            fmt={fmt}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onEdit={() => onEdit(selected)}
            onDelete={() => setPendingDelete(selected)}
            onOpenDay={() => onOpenDay(selected.date)}
            after={after}
            onReplay={onReplay ? () => onReplay(selected.date) : undefined}
          />
        )}
      </div>

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
            setSelectedId(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      {label}
      <b className={`mt-0.5 block text-[17px] font-bold tabular-nums ${tone || 'text-text-primary'}`}>{value}</b>
    </div>
  );
}
