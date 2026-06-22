import { useCallback, useRef, useState } from 'react';
import { TradeDetails } from './TradeDetails';
import type { ParsedTradeInput, Trade, TradeSide } from '../types';
import { formatCurrency } from '../utils/format';
import { loadApiKey, parseScreenshot, saveApiKey } from '../utils/parseScreenshot';

interface ScreenshotImportModalProps {
  onClose: () => void;
  onSave: (trades: Omit<Trade, 'id'>[]) => void;
}

type Step = 'upload' | 'parsing' | 'review';

interface ReviewTrade extends ParsedTradeInput {
  selected: boolean;
}

export function ScreenshotImportModal({ onClose, onSave }: ScreenshotImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [error, setError] = useState<string | null>(null);
  const [reviewTrades, setReviewTrades] = useState<ReviewTrade[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStep('upload');
    setReviewTrades([]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleParse = async () => {
    if (!file) return;

    saveApiKey(apiKey.trim());
    setError(null);
    setStep('parsing');

    try {
      const result = await parseScreenshot(file, apiKey.trim() || undefined);
      if (result.trades.length === 0) {
        setError('No trades found in this screenshot. Try a clearer image or log manually.');
        setStep('upload');
        return;
      }

      setReviewTrades(
        result.trades.map((t) => ({
          ...t,
          side: t.side ?? 'long',
          selected: true,
        })),
      );
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse screenshot');
      setStep('upload');
    }
  };

  const handleSave = () => {
    const toSave = reviewTrades
      .filter((t) => t.selected)
      .map(({ selected: _, ...t }) => t)
      .filter((t) => t.symbol && !isNaN(t.pnl));

    if (toSave.length === 0) {
      setError('Select at least one valid trade to import');
      return;
    }

    onSave(toSave);
    onClose();
  };

  const updateTrade = (index: number, patch: Partial<ReviewTrade>) => {
    setReviewTrades((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">Import from Screenshot</h3>
            <p className="text-xs text-text-secondary mt-1">
              Upload Thinkorswim — AI extracts P/L, contract, strike, Greeks, and more
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        {step === 'upload' && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
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
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {preview ? (
                <img
                  src={preview}
                  alt="Screenshot preview"
                  className="max-h-48 mx-auto rounded-md mb-3 object-contain"
                />
              ) : (
                <div className="text-4xl mb-3">📷</div>
              )}
              <p className="text-sm text-text-primary">
                {preview ? 'Click or drop to replace' : 'Drop screenshot here or click to browse'}
              </p>
              <p className="text-xs text-text-secondary mt-1">PNG, JPG, or screenshot from your phone</p>
            </div>

            <div className="mt-4">
              <label className="block">
                <span className="text-xs text-text-secondary mb-1 block">OpenAI API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="input-field"
                />
              </label>
              <p className="text-xs text-text-secondary mt-1">
                Optional if configured on the server. Stored locally in your browser.
              </p>
            </div>

            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                disabled={!file}
                onClick={handleParse}
                className="flex-1 py-2.5 bg-accent text-white rounded-md font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Parse with AI
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'parsing' && (
          <div className="py-12 text-center">
            <div className="text-3xl mb-4 animate-pulse">🤖</div>
            <p className="text-sm text-text-primary">Reading your screenshot...</p>
            <p className="text-xs text-text-secondary mt-1">
              Extracting P/L Day, contract, strike, mark, Greeks, underlying price...
            </p>
          </div>
        )}

        {step === 'review' && (
          <>
            <p className="text-sm text-text-secondary mb-3">
              Review parsed data before adding to your journal:
            </p>
            <div className="space-y-3 mb-4">
              {reviewTrades.map((trade, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-md border ${trade.selected ? 'border-border bg-bg-tertiary' : 'border-border/50 bg-bg-primary opacity-60'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={trade.selected}
                      onChange={(e) => updateTrade(i, { selected: e.target.checked })}
                      className="accent-accent"
                    />
                    <span className="font-medium">{trade.symbol}</span>
                    <span className={`text-sm font-semibold ml-auto ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      P/L Day {formatCurrency(trade.pnl)}
                    </span>
                  </div>

                  <TradeDetails trade={trade} compact />

                  <details className="mt-3">
                    <summary className="text-xs text-accent cursor-pointer">Edit core fields</summary>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        value={trade.symbol}
                        onChange={(e) => updateTrade(i, { symbol: e.target.value })}
                        className="input-field text-sm"
                        placeholder="Symbol"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={trade.pnl}
                        onChange={(e) => updateTrade(i, { pnl: parseFloat(e.target.value) || 0 })}
                        className="input-field text-sm"
                        placeholder="P/L Day"
                      />
                      <input
                        type="date"
                        value={trade.date}
                        onChange={(e) => updateTrade(i, { date: e.target.value })}
                        className="input-field text-sm"
                      />
                      <select
                        value={trade.side ?? 'long'}
                        onChange={(e) => updateTrade(i, { side: e.target.value as TradeSide })}
                        className="input-field text-sm"
                      >
                        <option value="long">Long</option>
                        <option value="short">Short</option>
                      </select>
                    </div>
                  </details>
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-2.5 bg-accent text-white rounded-md font-medium hover:opacity-90 transition-opacity"
              >
                Add to Journal
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('upload');
                  setError(null);
                }}
                className="px-4 py-2.5 border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
