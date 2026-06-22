import { useState } from 'react';
import { TradeDetails } from './TradeDetails';
import type { Trade, TradeSide } from '../types';
import { formatCurrency } from '../utils/format';

interface TradeModalProps {
  defaultDate?: string;
  onClose: () => void;
  onSave: (trade: Omit<Trade, 'id'>) => void;
}

const SETUP_OPTIONS = ['BREAKOUT', 'FOMO', 'RSI CROSSED', 'REVERSAL'];

export function TradeModal({ defaultDate, onClose, onSave }: TradeModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate ?? today);
  const [symbol, setSymbol] = useState('SPY');
  const [pnl, setPnl] = useState('');
  const [setup, setSetup] = useState('');
  const [side, setSide] = useState<TradeSide>('long');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pnlValue = parseFloat(pnl);
    if (!symbol || isNaN(pnlValue)) return;

    onSave({
      date,
      symbol: symbol.toUpperCase(),
      pnl: pnlValue,
      setup: setup || undefined,
      side,
      notes: notes || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Add Trade</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
              required
            />
          </Field>

          <Field label="Symbol">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="SPY"
              className="input-field"
              required
            />
          </Field>

          <Field label="P/L ($)">
            <input
              type="number"
              step="0.01"
              value={pnl}
              onChange={(e) => setPnl(e.target.value)}
              placeholder="260.00 or -1274.22"
              className="input-field"
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Enter your daily P/L from Thinkorswim (positive = green, negative = red)
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Setup / Tag">
              <select
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                className="input-field"
              >
                <option value="">None</option>
                {SETUP_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Side">
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as TradeSide)}
                className="input-field"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input-field resize-none"
              placeholder="SPY 746P weekly, etc."
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 py-2 bg-accent text-white rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Save Trade
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DayDetailModalProps {
  date: string;
  trades: Trade[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onAddTrade: () => void;
}

export function DayDetailModal({ date, trades, onClose, onDelete, onAddTrade }: DayDetailModalProps) {
  const dayTrades = trades.filter((t) => t.date === date);
  const totalPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">{formattedDate}</h3>
            {dayTrades.length > 0 && (
              <p className={`text-sm font-medium mt-1 ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                Total: {formatCurrency(totalPnl)} · {dayTrades.length} trades
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        {dayTrades.length === 0 ? (
          <p className="text-text-secondary text-sm mb-4">No trades recorded for this day.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {dayTrades.map((trade) => (
              <div
                key={trade.id}
                className="p-3 bg-bg-tertiary rounded-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{trade.symbol}</span>
                      {trade.optionType && (
                        <span className="text-xs text-text-secondary uppercase">{trade.optionType}</span>
                      )}
                      {trade.setup && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-tag text-bg-primary rounded-sm">
                          {trade.setup}
                        </span>
                      )}
                      {trade.side && (
                        <span className="text-xs text-text-secondary capitalize">{trade.side}</span>
                      )}
                    </div>
                    <TradeDetails trade={trade} compact />
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <div className="text-right">
                      <span className={`font-semibold block ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(trade.pnl)}
                      </span>
                      {trade.pnlOpen != null && (
                        <span className="text-xs text-text-secondary">Open {formatCurrency(trade.pnlOpen)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDelete(trade.id)}
                      className="text-text-secondary hover:text-red-400 text-sm"
                      aria-label="Delete trade"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onAddTrade}
          className="w-full py-2 border border-dashed border-border rounded-md text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
        >
          + Add trade for this day
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary mb-1 block">{label}</span>
      {children}
    </label>
  );
}
