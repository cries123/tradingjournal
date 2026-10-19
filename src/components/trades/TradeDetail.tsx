import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Trade } from '../../types';
import { tradeLine } from '../../utils/tradeLine';
import { holdTimeMinutes, tradeTags } from '../../utils/tradeHelpers';
import { tradeContext } from '../../utils/tradeContext';
import { ordinal } from '../../utils/dayReport';

function price(n: number | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}

export interface TradeDetailProps {
  trade: Trade;
  /** The active journal's trades, for where this one sat in its day. */
  ruleTrades: Trade[];
  usual: number | null;
  cap: number | undefined;
  fmt: (n: number) => string;
  /** Stepping through a list. Left out where there is no list to step through. */
  onPrev?: () => void;
  onNext?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenDay: () => void;
  /** A card beside the Trades page's table, or the body of the trade sheet. */
  frame?: 'panel' | 'sheet';
}

/**
 * One trade in full: the result, what it did to the day, the fills, its flags, setups and note.
 *
 * One component for both places a trade is opened, the Trades page's side panel and the sheet the
 * Overview's trade log opens, so the two can never show the same trade differently.
 *
 * Nothing here writes. The note is shown, not edited: the trade form is the one place a note is
 * changed, and Edit opens it.
 */
export function TradeDetail({ trade, ruleTrades, usual, cap, fmt, onPrev, onNext, onEdit, onDelete, onOpenDay, frame = 'panel' }: TradeDetailProps) {
  const line = tradeLine(trade);
  const ctx = tradeContext(trade, ruleTrades, usual);
  const held = holdTimeMinutes(trade);
  const tags = tradeTags(trade);
  const perUnit = trade.quantity ? trade.pnl / trade.quantity : null;
  // A trade that is not in the active journal (the all-journals view) has no place in its day:
  // tradeContext would call it the 1st, so its position, the cap flag and the day's running total
  // are left out rather than made up.
  const placed = ruleTrades.some((t) => t.id === trade.id);
  const flags: string[] = [];
  if (cap != null && placed && ctx.position > cap) flags.push(`${ordinal(ctx.position)} trade of the day. Your cap is ${cap}.`);
  if (ctx.oversized && usual != null) flags.push(`${trade.quantity} ${trade.assetType === 'option' ? 'contracts' : 'shares'}. You usually trade ${usual}.`);
  const tone = trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright';
  const date = new Date(`${trade.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
  const sheet = frame === 'sheet';
  const pad = sheet ? 'px-0' : 'px-[18px]';
  const Frame = sheet ? 'div' : 'aside';

  return (
    <Frame className={sheet ? '' : 'panel-card overflow-hidden p-0 xl:sticky xl:top-4'}>
      <div className={`border-b border-white/[0.06] ${pad} pb-3.5 ${sheet ? 'pt-1' : 'pt-4'}`}>
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            {date}
            {placed && ` · ${ordinal(ctx.position)} trade of the day`}
          </span>
          {onPrev && onNext && (
            <span className="flex gap-1">
              <button type="button" onClick={onPrev} aria-label="Previous trade" className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border focus-ring">
                <ChevronLeft size={14} />
              </button>
              <button type="button" onClick={onNext} aria-label="Next trade" className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border focus-ring">
                <ChevronRight size={14} />
              </button>
            </span>
          )}
        </div>
        <p className="mt-2.5 text-[17px] font-bold">
          {line.dated}
          {line.expiry && (
            <span className={`ml-1.5 rounded-md px-1.5 py-px align-[2px] text-[10.5px] font-semibold ${line.kind === 'put' ? 'bg-loss-bright/15 text-loss-bright' : 'bg-accent/15 text-accent'}`}>
              {line.expiry}
            </span>
          )}
        </p>
        <p className={`mt-1 text-[32px] font-extrabold leading-tight tracking-tight tabular-nums ${tone}`}>{fmt(trade.pnl)}</p>
        <p className="text-[12.5px] tabular-nums text-text-secondary">
          {perUnit != null && `${fmt(perUnit)} a ${trade.assetType === 'option' ? 'contract' : 'share'}`}
          {perUnit != null && placed && ' · '}
          {placed && (
            <>
              day went from <span className={ctx.dayBefore >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>{fmt(ctx.dayBefore)}</span> to{' '}
              <span className={ctx.dayBefore + trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>{fmt(ctx.dayBefore + trade.pnl)}</span>
            </>
          )}
        </p>
      </div>

      <div className={`grid grid-cols-3 border-b border-white/[0.06] ${sheet ? 'my-0' : ''}`}>
        <Fact label="Side" value={line.side ?? '—'} first={sheet} />
        <Fact label={trade.assetType === 'option' ? 'Contracts' : 'Quantity'} value={trade.quantity != null ? String(trade.quantity) : '—'} />
        <Fact label="Held" value={held != null ? `${held} min` : '—'} />
        <Fact label="Entry" value={price(trade.tradePrice)} first={sheet} />
        <Fact label="Exit" value={price(trade.exitPrice)} />
        <Fact label="Times" value={trade.entryTime ? `${trade.entryTime.slice(0, 5)}${trade.exitTime ? `–${trade.exitTime.slice(0, 5)}` : ''}` : '—'} />
      </div>

      {flags.length > 0 && (
        <div className={`border-b border-white/[0.06] ${pad} py-3.5`}>
          <p className="mb-2 text-xs text-text-secondary">Flags</p>
          {flags.map((f) => (
            <p key={f} className="flex gap-2.5 py-0.5 text-[13px] leading-snug before:mt-1.5 before:h-[7px] before:w-[7px] before:shrink-0 before:rounded-full before:bg-amber-400">
              {f}
            </p>
          ))}
        </div>
      )}

      <div className={`border-b border-white/[0.06] ${pad} py-3.5`}>
        <p className="mb-2 text-xs text-text-secondary">Setup</p>
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full border border-accent/50 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">None yet — Edit to tag it.</p>
        )}
      </div>

      <div className={`border-b border-white/[0.06] ${pad} py-3.5`}>
        <p className="mb-2 text-xs text-text-secondary">Note</p>
        {/* Shown, not edited here: the trade form is the one place a note is changed. */}
        <div className="min-h-[66px] whitespace-pre-wrap rounded-[10px] border border-border bg-bg-tertiary px-3 py-2.5 text-[13px] leading-relaxed">
          {trade.notes?.trim() || <span className="text-text-secondary">No note on this trade.</span>}
        </div>
      </div>

      {sheet ? (
        <div className="pt-3.5">
          <p className="mb-3 text-center text-[11.5px] text-text-secondary">{trade.sourceId ? 'Imported from your broker' : 'Logged by hand'}</p>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={onOpenDay} className="h-11 rounded-xl border border-border text-sm text-text-secondary hover:text-text-primary focus-ring">
              Open day
            </button>
            <button type="button" onClick={onEdit} className="btn-primary h-11 text-sm font-semibold focus-ring">
              Edit
            </button>
            <button type="button" onClick={onDelete} className="h-11 rounded-xl border border-border text-sm text-text-secondary hover:text-loss-bright focus-ring">
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-[18px] py-3 text-[11.5px] text-text-secondary">
          <span>{trade.sourceId ? 'Imported from your broker' : 'Logged by hand'}</span>
          <span className="flex gap-3">
            <button type="button" onClick={onOpenDay} className="hover:text-text-primary focus-ring rounded">
              Open day
            </button>
            <button type="button" onClick={onEdit} className="text-accent focus-ring rounded">
              Edit
            </button>
            <button type="button" onClick={onDelete} className="hover:text-loss-bright focus-ring rounded">
              Delete
            </button>
          </span>
        </div>
      )}
    </Frame>
  );
}

function Fact({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <div
      className={`border-b border-r border-white/[0.06] py-2.5 text-[11.5px] text-text-secondary [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0 ${
        first ? 'pl-0 pr-[18px]' : 'px-[18px]'
      }`}
    >
      {label}
      <b className="mt-0.5 block text-sm font-semibold tabular-nums text-text-primary">{value}</b>
    </div>
  );
}
