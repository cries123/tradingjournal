import { useEffect, useState } from 'react';
import { Camera, FileText, Plus, X } from 'lucide-react';
import { TradeListItem } from './TradeListItem';
import type { Trade } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../utils/format';

interface DayDetailDrawerProps {
  date: string;
  trades: Trade[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onAddTrade: () => void;
  onImportCsv: () => void;
  onImportScreenshot: () => void;
}

export function DayDetailDrawer({
  date,
  trades,
  onClose,
  onDelete,
  onAddTrade,
  onImportCsv,
  onImportScreenshot,
}: DayDetailDrawerProps) {
  const { settings } = useSettings();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const dayTrades = trades.filter((t) => t.date === date);
  const totalPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
        aria-label="Close day details"
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-bg-secondary border-l border-border/80 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label={`Trades for ${formattedDate}`}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border/60 shrink-0">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400/80 font-medium mb-1">Day detail</p>
            <h3 className="text-lg font-semibold">{formattedDate}</h3>
            {dayTrades.length > 0 && (
              <p className={`text-sm font-medium mt-1 ${totalPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                Total: {formatCurrency(totalPnl, settings.currency)} · {dayTrades.length} trades
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors focus-ring"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {dayTrades.length === 0 ? (
            <p className="text-text-secondary text-sm">No trades yet — import or add trades for this day.</p>
          ) : (
            <div className="space-y-2">
              {dayTrades.map((trade) => (
                <TradeListItem
                  key={trade.id}
                  trade={trade}
                  expanded={expandedId === trade.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === trade.id ? null : trade.id))
                  }
                  trailing={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(trade.id);
                      }}
                      className="text-text-secondary hover:text-loss-bright p-1 shrink-0 focus-ring rounded"
                      aria-label="Delete trade"
                    >
                      <X size={14} />
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border/60 shrink-0 space-y-2">
          <p className="text-xs text-text-secondary font-medium uppercase tracking-wide">Import trades</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onImportCsv}
              className="flex items-center justify-center gap-2 py-2.5 px-3 border border-border rounded-lg text-sm hover:border-accent/50 hover:bg-accent/5 transition-colors focus-ring"
            >
              <FileText size={16} />
              Import CSV
            </button>
            <button
              type="button"
              onClick={onImportScreenshot}
              className="flex items-center justify-center gap-2 py-2.5 px-3 border border-border rounded-lg text-sm hover:border-accent/50 hover:bg-accent/5 transition-colors focus-ring"
            >
              <Camera size={16} />
              Screenshot
            </button>
          </div>
          <button
            type="button"
            onClick={onAddTrade}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors text-sm focus-ring"
          >
            <Plus size={16} />
            Log trade manually
          </button>
        </div>
      </aside>
    </>
  );
}
