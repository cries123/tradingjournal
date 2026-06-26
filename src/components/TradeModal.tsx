import { useState } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import type { Trade, TradeSide } from '../types';

interface TradeModalProps {
  defaultDate?: string;
  onClose: () => void;
  onSave: (trade: Omit<Trade, 'id'>) => void;
}

export function TradeModal({ defaultDate, onClose, onSave }: TradeModalProps) {
  const { settings } = useSettings();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate ?? today);
  const [symbol, setSymbol] = useState(settings.defaultSymbol);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-backdrop-in motion-safe:animate-backdrop-in p-4" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-md shadow-xl animate-scale-in motion-safe:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Add Trade</h3>
          <button type="button" onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary focus-ring rounded" aria-label="Close">
            <X size={20} />
          </button>
        </div>
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
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Setup / Tag">
              <select
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                className="input-field"
              >
                <option value="">None</option>
                {settings.setupTags.map((s) => (
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
            <button type="submit" className="flex-1 btn-primary py-2.5 text-sm">
              Save Trade
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
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
