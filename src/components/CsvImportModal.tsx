import { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { TradeListItem } from './TradeListItem';
import type { Trade } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../utils/format';
import {
  brokerFormatLabel,
  detectCsvFormat,
  previewBrokerCsv,
  type CsvImportPreview,
} from '../utils/parseCsvRouter';

interface CsvImportModalProps {
  onClose: () => void;
  onSave: (trades: Omit<Trade, 'id'>[]) => void;
  targetDate?: string;
}

type Step = 'upload' | 'review';

function formatTargetDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CsvImportModal({ onClose, onSave, targetDate }: CsvImportModalProps) {
  const { settings } = useSettings();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [detectedFormat, setDetectedFormat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<CsvImportPreview[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file from your broker');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const format = detectCsvFormat(text);
        setDetectedFormat(brokerFormatLabel(format));
        let parsed = previewBrokerCsv(text);

        if (targetDate) {
          parsed = parsed.filter((t) => t.date === targetDate);
          if (parsed.length === 0) {
            setError(`No trades found for ${formatTargetDate(targetDate)} in this CSV. Try the full statement import from the sidebar.`);
            return;
          }
        }

        if (parsed.length === 0) {
          setError('No completed trades found in this CSV');
          return;
        }
        setError(null);
        setFileName(file.name);
        setTrades(parsed);
        setStep('review');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
        setStep('upload');
      }
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(file);
  }, [targetDate]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const selectedCount = trades.filter((t) => t.selected).length;

  const handleSave = () => {
    const toSave = trades
      .filter((t) => t.selected)
      .map((row) => {
        const { id, selected, ...t } = row;
        void id;
        void selected;
        return t;
      });

    if (toSave.length === 0) {
      setError('Select at least one trade to import');
      return;
    }

    onSave(toSave);
    onClose();
  };

  const totalPnl = trades.filter((t) => t.selected).reduce((s, t) => s + t.pnl, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-backdrop-in motion-safe:animate-backdrop-in p-4" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto animate-scale-in motion-safe:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">Import CSV</h3>
            <p className="text-xs text-text-secondary mt-1">
              {targetDate
                ? `Showing trades for ${formatTargetDate(targetDate)} only`
                : 'Schwab, Thinkorswim, or Robinhood CSV exports'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary focus-ring rounded" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {step === 'upload' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <FileSpreadsheet size={40} className="mx-auto mb-2 text-text-secondary" />
              <p className="text-sm">Drop your broker CSV here or click to browse</p>
              <p className="text-xs text-text-secondary mt-1">Auto-detects Schwab, TOS, and Robinhood formats</p>
            </div>
            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
          </>
        )}

        {step === 'review' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-text-secondary">
                  {selectedCount} of {trades.length} trades from <span className="text-text-primary">{fileName}</span>
                  {detectedFormat && <span className="ml-1 text-emerald-400">({detectedFormat})</span>}
                </p>
                <p className={`text-sm font-semibold mt-0.5 ${totalPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  Selected total: {formatCurrency(totalPnl, settings.currency)}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setTrades((p) => p.map((t) => ({ ...t, selected: true })))} className="text-accent hover:underline">Select all</button>
                <span className="text-text-secondary">·</span>
                <button type="button" onClick={() => setTrades((p) => p.map((t) => ({ ...t, selected: false })))} className="text-accent hover:underline">Deselect all</button>
              </div>
            </div>

            <div className="space-y-2 mb-4 max-h-[50vh] overflow-y-auto">
              {trades.map((trade) => (
                <div key={trade.id}>
                  <TradeListItem
                    trade={trade}
                    expanded={expandedIds.has(trade.id)}
                    onToggle={() =>
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(trade.id)) next.delete(trade.id);
                        else next.add(trade.id);
                        return next;
                      })
                    }
                    leading={
                      <input
                        type="checkbox"
                        checked={trade.selected}
                        onChange={(e) =>
                          setTrades((p) =>
                            p.map((t) => (t.id === trade.id ? { ...t, selected: e.target.checked } : t)),
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="accent-accent shrink-0"
                      />
                    }
                  />
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

            <p className="text-[11px] text-text-secondary mb-4 leading-relaxed">
              Broker fields import as-is. Psychology, rule adherence, and market context stay blank — edit any trade after import to add them.
            </p>

            <div className="flex gap-3">
              <button type="button" onClick={handleSave} className="flex-1 py-2.5 btn-primary text-sm">
                Import {selectedCount} Trades
              </button>
              <button type="button" onClick={() => { setStep('upload'); setError(null); }} className="px-4 py-2.5 btn-secondary text-sm">
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
