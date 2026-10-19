import { useMemo, useState } from 'react';
import { ChevronRight, StickyNote } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { tradesByDay } from '../../utils/tradingRules';
import { tradeLine, type TradeLine } from '../../utils/tradeLine';
import { tradeTags } from '../../utils/tradeHelpers';

interface TradeLogProps {
  /** The period's trades. */
  trades: Trade[];
  /** Days a rule was broken, marked on the day's header. */
  ruleDates?: ReadonlySet<string>;
  onDayClick: (date: string) => void;
  /** Opens the full trade list. */
  onAllTrades?: () => void;
  /** How many days to show before "Show more". */
  days?: number;
}

const NONE: ReadonlySet<string> = new Set();

function price(n: number | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}

function dayHeading(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function ExpiryTag({ line }: { line: TradeLine }) {
  if (!line.expiry) return null;
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        line.kind === 'put' ? 'bg-loss/15 text-loss-bright' : 'bg-accent/15 text-accent'
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
 * per day. Every row opens its day, where the trade is edited and the day's note lives, so this list
 * never writes anything itself.
 *
 * In the order the day was traded, the order the rules and the simulator read. One table for every
 * day on desktop, so the columns line up down the page; times only when a trade has one, since
 * Schwab sends dates without fills and a column of dashes says nothing.
 */
export function TradeLog({ trades, ruleDates = NONE, onDayClick, onAllTrades, days = 4 }: TradeLogProps) {
  const { settings } = useSettings();
  const [limit, setLimit] = useState(days);
  const grouped = useMemo(() => [...tradesByDay(trades).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)), [trades]);
  const shown = grouped.slice(0, limit);
  const anyTime = trades.some((t) => Boolean(t.entryTime));
  const columns = anyTime ? 9 : 8;
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  if (grouped.length === 0) return null;

  const dayHeader = (date: string, dayTrades: Trade[]) => {
    const net = dayTrades.reduce((s, t) => s + t.pnl, 0);
    const wins = dayTrades.filter((t) => t.pnl > 0).length;
    return (
      <button
        type="button"
        onClick={() => onDayClick(date)}
        className="w-full flex items-center gap-2 rounded-lg bg-bg-tertiary/60 px-3 py-2 text-left text-[13px] hover:bg-bg-tertiary transition-colors focus-ring"
      >
        <span className="font-semibold whitespace-nowrap">{dayHeading(date)}</span>
        <span className="text-text-secondary truncate">
          {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'} · {wins} won {dayTrades.length - wins} lost
          {ruleDates.has(date) && <span className="hidden sm:inline text-amber-300"> · broke a rule</span>}
        </span>
        {/* On a phone the words do not fit beside the count, so the mark the calendar uses stands in. */}
        {ruleDates.has(date) && (
          <span className="sm:hidden h-2 w-2 shrink-0 rounded-full bg-amber-400" role="img" aria-label="Broke a rule" />
        )}
        <span className={`ml-auto font-bold tabular-nums ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(net)}</span>
        <ChevronRight size={14} className="shrink-0 text-text-secondary" aria-hidden />
      </button>
    );
  };

  return (
    <section className="panel-card p-3 md:p-4">
      <div className="flex items-baseline justify-between gap-2 px-1 mb-2">
        <h2 className="text-sm font-semibold">
          Trade log <span className="ml-1 text-xs font-normal text-text-secondary">{trades.length} trades</span>
        </h2>
        {onAllTrades && (
          <button type="button" onClick={onAllTrades} className="text-xs text-accent hover:text-accent/80 focus-ring rounded">
            All trades
          </button>
        )}
      </div>

      {/* Desktop: one table, every day a group inside it. */}
      <table className="hidden md:table w-full table-fixed text-[13px]">
        <colgroup>
          {anyTime && <col className="w-16" />}
          <col />
          <col className="w-16" />
          <col className="w-12" />
          <col className="w-16" />
          <col className="w-16" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-8" />
        </colgroup>
        <thead>
          <tr className="text-[11px] text-text-secondary">
            {anyTime && <th className="pb-1.5 pl-3 text-left font-medium">Time</th>}
            <th className="pb-1.5 pl-3 text-left font-medium">Contract</th>
            <th className="pb-1.5 px-2 text-left font-medium">Side</th>
            <th className="pb-1.5 px-2 text-right font-medium">Qty</th>
            <th className="pb-1.5 px-2 text-right font-medium">Entry</th>
            <th className="pb-1.5 px-2 text-right font-medium">Exit</th>
            <th className="pb-1.5 px-2 text-right font-medium">P&amp;L</th>
            <th className="pb-1.5 px-2 text-left font-medium">Setup</th>
            <th className="pb-1.5" aria-label="Note" />
          </tr>
        </thead>
        {shown.map(([date, dayTrades]) => (
          <tbody key={date}>
            <tr>
              <td colSpan={columns} className="pt-2 pb-1">
                {dayHeader(date, dayTrades)}
              </td>
            </tr>
            {dayTrades.map((trade) => {
              const line = tradeLine(trade);
              const tags = tradeTags(trade);
              return (
                <tr key={trade.id} onClick={() => onDayClick(date)} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-bg-tertiary/40">
                  {anyTime && <td className="py-2 pl-3 tabular-nums text-text-secondary">{trade.entryTime?.slice(0, 5) ?? '—'}</td>}
                  <td className="py-2 pl-3 pr-2 font-semibold whitespace-nowrap truncate">
                    {line.title}
                    <ExpiryTag line={line} />
                  </td>
                  <td className="py-2 px-2 text-text-secondary">{line.side ?? ''}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{trade.quantity ?? '—'}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-text-secondary">{price(trade.tradePrice)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-text-secondary">{price(trade.exitPrice)}</td>
                  <td className={`py-2 px-2 text-right font-semibold tabular-nums ${trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                    {fmt(trade.pnl)}
                  </td>
                  <td className="py-2 px-2 text-text-secondary truncate">{tags.join(', ') || '—'}</td>
                  <td className="py-2 pr-2">{trade.notes?.trim() && <StickyNote size={14} className="text-text-secondary" aria-label="Has a note" />}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>

      {/* Phone: each day a header and a list of cards. */}
      <div className="md:hidden space-y-3">
        {shown.map(([date, dayTrades]) => (
          <div key={date}>
            {dayHeader(date, dayTrades)}
            <ul className="mt-1 divide-y divide-border/40">
              {dayTrades.map((trade) => {
                const line = tradeLine(trade);
                const tags = tradeTags(trade);
                return (
                  <li key={trade.id}>
                    <button
                      type="button"
                      onClick={() => onDayClick(date)}
                      className="w-full grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-1 py-2.5 text-left focus-ring rounded"
                    >
                      <span className="flex items-center text-[15px] font-semibold min-w-0">
                        <span className="truncate">{line.title}</span>
                        <ExpiryTag line={line} />
                        {trade.notes?.trim() && <StickyNote size={13} className="ml-1.5 shrink-0 text-text-secondary" aria-label="Has a note" />}
                      </span>
                      <span className={`text-right text-[15px] font-bold tabular-nums ${trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                        {fmt(trade.pnl)}
                      </span>
                      <span className="text-[12px] text-text-secondary tabular-nums truncate">
                        {[
                          trade.entryTime?.slice(0, 5),
                          line.side && trade.quantity != null ? `${line.side} ${trade.quantity}` : line.side,
                          trade.tradePrice != null ? `${price(trade.tradePrice)} → ${price(trade.exitPrice)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="text-right text-[12px] text-text-secondary truncate">{tags.join(', ')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {grouped.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + days)}
          className="mt-3 w-full rounded-lg py-2 text-xs font-medium text-accent hover:bg-accent/5 focus-ring"
        >
          Show {Math.min(days, grouped.length - limit)} earlier day{Math.min(days, grouped.length - limit) === 1 ? '' : 's'}
        </button>
      )}
    </section>
  );
}
