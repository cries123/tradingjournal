import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { useAnimatedClose } from '../../hooks/useAnimatedClose';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { formatCurrency } from '../../utils/format';
import { usualQuantity } from '../../utils/tradeContext';
import { describeTradeForDeletion } from '../../utils/tradeHelpers';
import { tradeLine } from '../../utils/tradeLine';
import { ConfirmDialog } from '../ConfirmDialog';
import { TradeDetail } from './TradeDetail';

interface TradeSheetProps {
  trade: Trade;
  /** The active journal's trades, for where this one sat in its day. */
  ruleTrades: Trade[];
  onClose: () => void;
  onOpenDay: (date: string) => void;
  onEdit: (trade: Trade) => void;
  onDelete: (id: string) => void;
  /** The trade form is open over the sheet, so Escape is the form's, not the sheet's. */
  covered?: boolean;
}

/**
 * One trade, opened from the Overview's trade log: a sheet on a phone, a window on desktop.
 *
 * Jay: "when people go to trades and click on a trade it should show them trade info, like their
 * note etc not go to the day worth of trades." Every row in the log used to open its day, so reading
 * one trade's note meant finding it again in a list of seven. The day is still one tap away, from
 * the day's own row in the log and from Open day here.
 *
 * Every way out plays the sheet out through useAnimatedClose. Edit opens the trade form over the
 * sheet, as the day sheet does, and the sheet shows the saved trade when it closes.
 */
export function TradeSheet({ trade, ruleTrades, onClose, onOpenDay, onEdit, onDelete, covered = false }: TradeSheetProps) {
  const { settings, viewingAllJournals } = useSettings();
  const { closing, close } = useAnimatedClose(onClose);
  const [confirming, setConfirming] = useState(false);
  // Escape answers whatever is on top (the delete confirmation, or the trade form) rather than closing both.
  useEscapeToClose(close, !confirming && !covered);
  const usual = useMemo(() => usualQuantity(ruleTrades), [ruleTrades]);
  const cap = settings.tradingRules.enabled && !viewingAllJournals ? settings.tradingRules.maxTradesPerDay : undefined;
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  return (
    <>
      <button
        type="button"
        aria-label="Close the trade"
        onClick={close}
        className={`fixed inset-0 z-50 bg-black/55 ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}
      />
      {/* A flex frame rather than a translate: the open and close animations own the transform. */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Trade: ${tradeLine(trade).dated}`}
          className={`flex max-h-[88vh] w-full flex-col rounded-t-[24px] border-t border-[#2a2a2a] bg-[#101010] shadow-[0_-20px_50px_rgba(0,0,0,0.6)] md:max-h-[85vh] md:w-[440px] md:rounded-[20px] md:border ${
            closing ? 'animate-scale-out' : 'animate-fade-up'
          } ${closing ? 'pointer-events-none' : 'pointer-events-auto'}`}
        >
          <div className="relative shrink-0 pt-2.5">
            <div className="mx-auto h-[5px] w-10 rounded-full bg-[#3a3a3a] md:hidden" aria-hidden />
            <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-2 rounded-lg p-1.5 text-text-secondary focus-ring">
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <TradeDetail
              frame="sheet"
              trade={trade}
              ruleTrades={ruleTrades}
              usual={usual}
              cap={cap}
              fmt={fmt}
              onOpenDay={() => onOpenDay(trade.date)}
              onEdit={() => onEdit(trade)}
              onDelete={() => setConfirming(true)}
            />
          </div>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete this trade?"
          message={describeTradeForDeletion(trade)}
          confirmLabel="Delete trade"
          cancelLabel="Keep it"
          danger
          onConfirm={() => {
            setConfirming(false);
            onDelete(trade.id);
            close();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
