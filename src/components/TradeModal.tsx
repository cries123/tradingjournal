import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import type { Trade, TradeSide } from '../types';

interface TradeModalProps {
  trade?: Trade;
  defaultDate?: string;
  onClose: () => void;
  onSave: (trade: Omit<Trade, 'id'>) => void;
  onUpdate?: (trade: Trade) => void;
}

export function TradeModal({ trade, defaultDate, onClose, onSave, onUpdate }: TradeModalProps) {
  const isEdit = Boolean(trade);
  const { settings } = useSettings();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(trade?.date ?? defaultDate ?? today);
  const [symbol, setSymbol] = useState(trade?.symbol ?? settings.defaultSymbol);
  const [pnl, setPnl] = useState(trade ? String(trade.pnl) : '');
  const [setup, setSetup] = useState(trade?.setup ?? '');
  const [side, setSide] = useState<TradeSide>(trade?.side ?? 'long');
  const [notes, setNotes] = useState(trade?.notes ?? '');

  useEffect(() => {
    if (trade) {
      setDate(trade.date);
      setSymbol(trade.symbol);
      setPnl(String(trade.pnl));
      setSetup(trade.setup ?? '');
      setSide(trade.side ?? 'long');
      setNotes(trade.notes ?? '');
    }
  }, [trade]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pnlValue = parseFloat(pnl);
    if (!symbol || isNaN(pnlValue)) return;

    const payload = {
      date,
      symbol: symbol.toUpperCase(),
      pnl: pnlValue,
      setup: setup || undefined,
      side,
      notes: notes || undefined,
      accountId: trade?.accountId,
      contract: trade?.contract,
      assetType: trade?.assetType,
      optionType: trade?.optionType,
      expiration: trade?.expiration,
      strike: trade?.strike,
      quantity: trade?.quantity,
    };

    if (isEdit && trade && onUpdate) {
      onUpdate({ ...trade, ...payload });
    } else {
      onSave(payload);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-backdrop-in motion-safe:animate-backdrop-in p-4" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-md shadow-xl animate-scale-in motion-safe:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{isEdit ? 'Edit Trade' : 'Add Trade'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary focus-ring rounded" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" required />
          </Field>
          <Field label="Symbol">
            <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="SPY" className="input-field" required />
          </Field>
          <Field label="P/L ($)">
            <input type="number" step="0.01" value={pnl} onChange={(e) => setPnl(e.target.value)} placeholder="260.00 or -1274.22" className="input-field" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Setup / Tag">
              <select value={setup} onChange={(e) => setSetup(e.target.value)} className="input-field">
                <option value="">None</option>
                {settings.setupTags.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Side">
              <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)} className="input-field">
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>
          </div>
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input-field resize-none" placeholder="SPY 746P weekly, etc." />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 btn-primary py-2.5 text-sm">
              {isEdit ? 'Save changes' : 'Save Trade'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 btn-secondary text-sm">Cancel</button>
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
