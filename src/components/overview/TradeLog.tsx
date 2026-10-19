import { useMemo, useState } from 'react';
import { StickyNote } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { tradesByDay } from '../../utils/tradingRules';
import { tradeLine, type TradeLine } from '../../utils/tradeLine';
import { tradeTags } from '../../utils/tradeHelpers';
import { dayRuleLines, type DayRuleLine } from '../../utils/dayReport';

interface TradeLogProps {
  /** The period's trades. */
  trades: Trade[];
  /** The active journal's trades, unfiltered — what a day's rule breaks are judged on. */
  ruleTrades?: Trade[];
  /** Days a rule was broken (the active journal's), marked on the day's header. */
  ruleDates?: ReadonlySet<string>;
  /** A day's own row opens the day. */
  onDayClick: (date: string) => void;
  /** A trade's row opens the trade, with its note. Without it, a trade's row opens its day. */
  onTradeClick?: (trade: Trade) => void;
  /** Opens the full trade list. */
  onAllTrades?: () => void;
  /** "September" — the period, in the card's heading. */
  periodName?: string;
  /** How many days to show before "Show more". */
  days?: number;
}

const NONE: ReadonlySet<string> = new Set();

function price(n: number | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}

function dayHeading(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
}

/** What broke, as the desktop day row says it: "daily loss −$664 past −$500". */
function brokeLong(line: DayRuleLine, dayTrades: Trade[], rules: { maxDailyLoss?: number; maxTradesPerDay?: number; maxConsecutiveLosses?: number; maxDailyGain?: number }, fmt: (n: number) => string): string {
  const net = dayTrades.reduce((s, t) => s + t.pnl, 0);
  switch (line.type) {
    case 'max_loss':
      return `daily loss ${fmt(net)} past ${fmt(-Math.abs(rules.maxDailyLoss ?? 0))}`;
    case 'max_trades':
      return `${dayTrades.length} trades past ${rules.maxTradesPerDay}`;
    case 'max_streak':
      return `${line.detail.replace(/\.$/, '').toLowerCase()} past ${rules.maxConsecutiveLosses}`;
    case 'max_gain':
      return `up ${fmt(net)} past ${fmt(rules.maxDailyGain ?? 0)}`;
  }
}

/** The phone chip's short names: "loss limit, trade cap". */
const SHORT: Record<DayRuleLine['type'], string> = {
  max_loss: 'loss limit',
  max_trades: 'trade cap',
  max_streak: 'losing streak',
  max_gain: 'profit target',
};

function ExpiryPill({ line }: { line: TradeLine }) {
  if (!line.expiry) return null;
  return (
    <span
      className={`ml-1 inline-block rounded-md px-1.5 py-px align-[1px] text-[10.5px] font-semibold ${
        line.kind === 'put' ? 'bg-loss-bright/15 text-loss-bright' : 'bg-accent/15 text-accent'
      }`}
    >
      {line.expiry}
    </span>
  );
}

/**
 * The period's trades, newest day first, each day with its result.
 *
 * The Overview never listed a single trade — a front page of totals, with the trades one drawer away
 * per day. A day's row opens the day, where the day's note lives; a trade's row opens that trade, with
 * its own note (Jay: "click on a trade it should show them trade info … not go to the day"). This list
 * never writes anything itself.
 *
 * In the order the day was traded, the order the rules and the simulator read. One table for every
 * day on desktop, so the columns line up down the page; the Time column only when a trade has a
 * time, since Schwab sends dates without fills and a column of dashes says nothing.
 */
export function TradeLog({ trades, ruleTrades, ruleDates = NONE, onDayClick, onTradeClick, onAllTrades, periodName, days = 3 }: TradeLogProps) {
  const openTrade = (trade: Trade) => (onTradeClick ? onTradeClick(trade) : onDayClick(trade.date));
  const { settings } = useSettings();
  const [limit, setLimit] = useState(days);
  const grouped = useMemo(() => [...tradesByDay(trades).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)), [trades]);
  const ruleDays = useMemo(() => tradesByDay(ruleTrades ?? trades), [ruleTrades, trades]);
  const shown = grouped.slice(0, limit);
  const anyTime = trades.some((t) => Boolean(t.entryTime));
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  if (grouped.length === 0) return null;

  const broken = (date: string) =>
    ruleDates.has(date) ? dayRuleLines(ruleDays.get(date) ?? [], settings.tradingRules, fmt).filter((l) => l.broken) : [];
  const more = grouped.length - limit;
  const showMore = more > 0 && (
    <button type="button" onClick={() => setLimit((l) => l + days)} className="mt-2 text-xs text-accent hover:text-accent/80 focus-ring rounded md:px-2">
      Show {Math.min(days, more)} earlier day{Math.min(days, more) === 1 ? '' : 's'} →
    </button>
  );

  return (
    <section>
      <div className="hidden md:block panel-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <h2 className="flex items-baseline gap-2.5 text-sm font-semibold">
          Trade log
          <small className="text-xs font-normal text-text-secondary">
            {periodName ? `${periodName} · ` : ''}
            {trades.length} trades
          </small>
        </h2>
        {onAllTrades && (
          <button type="button" onClick={onAllTrades} className="whitespace-nowrap text-xs text-accent hover:text-accent/80 focus-ring rounded">
            All trades →
          </button>
        )}
      </div>

      {/* ── Desktop: one table, every day a row inside it ── */}
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-[11px] text-text-secondary/70">
            {anyTime && <th className="border-b border-white/[0.06] px-2 py-1.5 text-left font-medium">Time</th>}
            <th className="border-b border-white/[0.06] px-2 py-1.5 text-left font-medium">Symbol</th>
            <th className="border-b border-white/[0.06] px-2 py-1.5 text-left font-medium">Side</th>
            <th className="border-b border-white/[0.06] px-2 py-1.5 text-right font-medium">Qty</th>
            <th className="border-b border-white/[0.06] px-2 py-1.5 text-right font-medium">Entry</th>
            <th className="border-b border-white/[0.06] px-2 py-1.5 text-right font-medium">Exit</th>
            <th className="border-b border-white/[0.06] px-2 py-1.5 text-right font-medium">P&amp;L</th>
            <th className="border-b border-white/[0.06] px-2 py-1.5 text-left font-medium">Setup</th>
            <th className="border-b border-white/[0.06] px-2 py-1.5" aria-label="Note" />
          </tr>
        </thead>
        <tbody>
          {shown.flatMap(([date, dayTrades]) => {
            const net = dayTrades.reduce((s, t) => s + t.pnl, 0);
            const wins = dayTrades.filter((t) => t.pnl > 0).length;
            const lines = broken(date);
            return [
              <tr key={`d-${date}`} onClick={() => onDayClick(date)} className="cursor-pointer">
                <td colSpan={anyTime ? 6 : 5} className="border-b border-white/[0.06] bg-bg-tertiary px-2 py-[7px] text-xs font-semibold">
                  {dayHeading(date)}{' '}
                  <span className="font-normal text-text-secondary">
                    · {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'} · {wins}W {dayTrades.length - wins}L
                  </span>
                  {lines.length > 0 && (
                    <>
                      {' '}
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400/20 align-middle text-[9px] font-bold text-amber-300" aria-hidden>
                        !
                      </span>{' '}
                      <span className="font-normal text-text-secondary">
                        {lines.map((l) => brokeLong(l, ruleDays.get(date) ?? dayTrades, settings.tradingRules, fmt)).join(' · ')}
                      </span>
                    </>
                  )}
                </td>
                <td className={`border-b border-white/[0.06] bg-bg-tertiary px-2 py-[7px] text-right text-xs font-semibold tabular-nums ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {fmt(net)}
                </td>
                <td colSpan={2} className="border-b border-white/[0.06] bg-bg-tertiary" />
              </tr>,
              ...dayTrades.map((trade) => {
                const line = tradeLine(trade);
                const tags = tradeTags(trade);
                return (
                  <tr key={trade.id} onClick={() => openTrade(trade)} className="cursor-pointer hover:bg-white/[0.02]">
                    {anyTime && <td className="whitespace-nowrap border-b border-white/[0.06] px-2 py-2 tabular-nums text-text-secondary">{trade.entryTime?.slice(0, 5) ?? '—'}</td>}
                    <td className="whitespace-nowrap border-b border-white/[0.06] px-2 py-2 font-semibold">
                      {line.dated}
                      <ExpiryPill line={line} />
                    </td>
                    <td className="whitespace-nowrap border-b border-white/[0.06] px-2 py-2">{line.side ?? ''}</td>
                    <td className="border-b border-white/[0.06] px-2 py-2 text-right tabular-nums">{trade.quantity ?? '—'}</td>
                    <td className="border-b border-white/[0.06] px-2 py-2 text-right tabular-nums">{price(trade.tradePrice)}</td>
                    <td className="border-b border-white/[0.06] px-2 py-2 text-right tabular-nums">{price(trade.exitPrice)}</td>
                    <td className={`whitespace-nowrap border-b border-white/[0.06] px-2 py-2 text-right tabular-nums ${trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                      {fmt(trade.pnl)}
                    </td>
                    <td className="max-w-[140px] truncate border-b border-white/[0.06] px-2 py-2 text-[11px] text-text-secondary">{tags.join(', ') || '—'}</td>
                    <td className="border-b border-white/[0.06] px-2 py-2">
                      {trade.notes?.trim() && <StickyNote size={13} className="text-text-secondary" aria-label="Has a note" />}
                    </td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
      {showMore}
      </div>

      {/* ── Phone: day headers and a card per trade ── */}
      <div className="md:hidden">
        {shown.map(([date, dayTrades]) => {
          const net = dayTrades.reduce((s, t) => s + t.pnl, 0);
          const wins = dayTrades.filter((t) => t.pnl > 0).length;
          const lines = broken(date);
          return (
            <div key={date}>
              <button type="button" onClick={() => onDayClick(date)} className="flex w-full items-start justify-between gap-2 pt-2.5 pb-1.5 text-left focus-ring rounded">
                <span>
                  <b className="text-sm">{dayHeading(date)}</b>
                  <span className="ml-1.5 text-xs text-text-secondary">
                    {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'} · {wins}W {dayTrades.length - wins}L
                  </span>
                  {lines.length > 0 && (
                    <span className="mt-1 flex w-fit items-center gap-[5px] rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-400">
                      ● Broke {lines.length} rule{lines.length === 1 ? '' : 's'} · {lines.map((l) => SHORT[l.type]).join(', ')}
                    </span>
                  )}
                </span>
                <span className={`text-sm font-bold tabular-nums ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(net)}</span>
              </button>
              {dayTrades.map((trade) => {
                const line = tradeLine(trade);
                const tags = tradeTags(trade);
                return (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => openTrade(trade)}
                    className="mb-1.5 grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-[3px] rounded-[14px] border border-white/[0.07] bg-bg-card px-3 py-[11px] text-left focus-ring"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold">
                      <span className="truncate">{line.title}</span>
                      <ExpiryPill line={line} />
                    </span>
                    <span className={`text-right text-[15px] font-bold tabular-nums ${trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(trade.pnl)}</span>
                    <span className="truncate text-xs tabular-nums text-text-secondary">
                      {[
                        trade.entryTime?.slice(0, 5),
                        line.side && trade.quantity != null ? `${line.side} ${trade.quantity}` : line.side,
                        trade.tradePrice != null ? `${price(trade.tradePrice)} → ${price(trade.exitPrice)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="flex items-center justify-end gap-1 text-right text-xs text-text-secondary">
                      <span className="truncate">{tags.join(', ')}</span>
                      {trade.notes?.trim() && <StickyNote size={14} className="shrink-0 text-text-secondary/70" aria-label="Has a note" />}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {showMore}
      </div>
    </section>
  );
}
