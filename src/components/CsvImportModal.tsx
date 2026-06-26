import { useCallback, useRef, useState } from 'react';
import { TradeListItem } from './TradeListItem';
import type { Trade } from '../types';
import { formatCurrency } from '../utils/format';
import { previewSchwabCsv, type SchwabImportPreview } from '../utils/parseSchwabCsv';

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
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<SchwabImportPreview[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a Schwab account statement CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        let parsed = previewSchwabCsv(text);

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
      .map(({ id: _, selected: __, ...t }) => t);

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
            <h3 className="text-lg font-semibold">Import Schwab Statement</h3>
            <p className="text-xs text-text-secondary mt-1">
              {targetDate
                ? `Showing trades for ${formatTargetDate(targetDate)} only`
                : 'Upload your Schwab/Thinkorswim account statement CSV'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary text-xl">×</button>
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
              <div className="text-4xl mb-2">📄</div>
              <p className="text-sm">Drop your AccountStatement CSV here or click to browse</p>
              <p className="text-xs text-text-secondary mt-1">Schwab → History → Export account statement</p>
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
                </p>
                <p className={`text-sm font-semibold mt-0.5 ${totalPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  Selected total: {formatCurrency(totalPnl)}
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

            <div className="flex gap-3">
              <button type="button" onClick={handleSave} className="flex-1 py-2.5 bg-accent text-white rounded-md font-medium hover:opacity-90">
                Import {selectedCount} Trades
              </button>
              <button type="button" onClick={() => { setStep('upload'); setError(null); }} className="px-4 py-2.5 border border-border rounded-md text-text-secondary hover:text-text-primary">
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
