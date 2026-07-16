import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Camera } from 'lucide-react';
import { TradeListItem } from './TradeListItem';
import type { ParsedTradeInput, Trade, TradeSide } from '../types';
import { useAuth } from '../context/AuthContext';
import { checkParseServer, loadApiKey, parseScreenshot, saveApiKey } from '../utils/parseScreenshot';

interface ScreenshotImportModalProps {
  onClose: () => void;
  onSave: (trades: Omit<Trade, 'id'>[]) => void;
  targetDate?: string;
}

type Step = 'upload' | 'parsing' | 'review';

interface PendingFile {
  id: string;
  file: File;
  preview: string;
}

interface ReviewTrade extends ParsedTradeInput {
  id: string;
  selected: boolean;
  sourceFile: string;
}

export function ScreenshotImportModal({ onClose, onSave, targetDate }: ScreenshotImportModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [serverHasApiKey, setServerHasApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewTrades, setReviewTrades] = useState<ReviewTrade[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [parseProgress, setParseProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void checkParseServer().then((status) => {
      if (status.hasApiKey) setServerHasApiKey(true);
    });
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const images = Array.from(incoming).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      setError('Please upload image files (PNG, JPG, etc.)');
      return;
    }
    setError(null);
    setPendingFiles((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
    setReviewTrades([]);
    setStep('upload');
  }, []);

  const removeFile = (id: string) => {
    setPendingFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleParse = async () => {
    if (pendingFiles.length === 0) return;

    saveApiKey(apiKey.trim());
    setError(null);

    const serverStatus = await checkParseServer();
    if (!serverStatus.ok) {
      setError('Server is not running. Reload the page and try again.');
      return;
    }

    const effectiveKey = serverStatus.hasApiKey ? undefined : apiKey.trim() || undefined;
    if (!serverStatus.hasApiKey && !effectiveKey) {
      setError('OpenAI API key is required. Add it below or set OPENAI_API_KEY on the server.');
      return;
    }

    setStep('parsing');

    const allTrades: ReviewTrade[] = [];
    const errors: string[] = [];

    for (let i = 0; i < pendingFiles.length; i++) {
      const { file, id } = pendingFiles[i];
      setParseProgress(`Parsing screenshot ${i + 1} of ${pendingFiles.length}...`);

      if (i > 0) await new Promise((r) => setTimeout(r, 500));

      try {
        const result = await parseScreenshot(file, effectiveKey, user?.uid);
        for (const t of result.trades) {
          allTrades.push({
            ...t,
            date: targetDate ?? t.date,
            id: crypto.randomUUID(),
            side: t.side ?? 'long',
            selected: true,
            sourceFile: file.name || id,
          });
        }
        if (result.trades.length === 0) {
          errors.push(`No trades found in ${file.name || 'screenshot'}`);
        }
      } catch (err) {
        errors.push(`${file.name || 'Screenshot'}: ${err instanceof Error ? err.message : 'parse failed'}`);
      }
    }

    if (allTrades.length === 0) {
      setError(errors.join(' · ') || 'No trades found in any screenshot.');
      setStep('upload');
      return;
    }

    if (errors.length) setError(errors.join(' · '));
    setReviewTrades(allTrades);
    setStep('review');
  };

  const handleSave = () => {
    const toSave = reviewTrades
      .filter((t) => t.selected)
      .map((row) => {
        const { selected, id, sourceFile, ...t } = row;
        void selected;
        void id;
        void sourceFile;
        return t;
      })
      .filter((t) => t.symbol && !isNaN(t.pnl));

    if (toSave.length === 0) {
      setError('Select at least one valid trade to import');
      return;
    }

    onSave(toSave);
    onClose();
  };

  const updateTrade = (id: string, patch: Partial<ReviewTrade>) => {
    setReviewTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = reviewTrades.filter((t) => t.selected).length;
  const allSelected = reviewTrades.length > 0 && selectedCount === reviewTrades.length;

  const setAllSelected = (selected: boolean) => {
    setReviewTrades((prev) => prev.map((t) => ({ ...t, selected })));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-backdrop-in motion-safe:animate-backdrop-in p-4" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto animate-scale-in motion-safe:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">Import from Screenshot</h3>
            <p className="text-xs text-text-secondary mt-1">
              {targetDate
                ? `Trades will be logged to ${new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : 'Upload one or more Thinkorswim screenshots — select trades to import'}
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
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <Camera size={40} className="mx-auto mb-2 text-text-secondary" />
              <p className="text-sm text-text-primary">Drop screenshots here or click to browse</p>
              <p className="text-xs text-text-secondary mt-1">Select multiple files at once</p>
            </div>

            {pendingFiles.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {pendingFiles.map(({ id, preview, file }) => (
                  <div key={id} className="relative group">
                    <img
                      src={preview}
                      alt={file.name}
                      className="w-full h-24 object-cover rounded-md border border-border"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(id);
                      }}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                    <p className="text-[10px] text-text-secondary truncate mt-1">{file.name}</p>
                  </div>
                ))}
              </div>
            )}

            {!serverHasApiKey && (
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
              </div>
            )}

            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                disabled={pendingFiles.length === 0}
                onClick={handleParse}
                className="flex-1 py-2.5 bg-accent text-white rounded-md font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Parse {pendingFiles.length > 1 ? `${pendingFiles.length} Screenshots` : 'with AI'}
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
            <Bot size={36} className="mx-auto mb-4 text-emerald-400 animate-pulse" />
            <p className="text-sm text-text-primary">{parseProgress || 'Reading screenshots...'}</p>
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-text-secondary">
                {selectedCount} of {reviewTrades.length} trades selected
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAllSelected(true)}
                  className="text-accent hover:underline"
                  disabled={allSelected}
                >
                  Select all
                </button>
                <span className="text-text-secondary">·</span>
                <button
                  type="button"
                  onClick={() => setAllSelected(false)}
                  className="text-accent hover:underline"
                  disabled={selectedCount === 0}
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {reviewTrades.map((trade) => (
                <div key={trade.id}>
                  <TradeListItem
                    trade={trade}
                    expanded={expandedIds.has(trade.id)}
                    onToggle={() => toggleExpanded(trade.id)}
                    leading={
                      <input
                        type="checkbox"
                        checked={trade.selected}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateTrade(trade.id, { selected: e.target.checked });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-accent shrink-0"
                      />
                    }
                  />
                  {expandedIds.has(trade.id) && (
                    <div className="mt-1 ml-8 grid grid-cols-2 gap-2">
                      <input
                        value={trade.symbol}
                        onChange={(e) => updateTrade(trade.id, { symbol: e.target.value })}
                        className="input-field text-sm"
                        placeholder="Symbol"
                      />
                      <div className="flex gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={trade.pnl}
                          onChange={(e) => updateTrade(trade.id, { pnl: parseFloat(e.target.value) || 0 })}
                          className="input-field text-sm flex-1"
                          placeholder="P/L Day"
                        />
                        <button
                          type="button"
                          onClick={() => updateTrade(trade.id, { pnl: -trade.pnl })}
                          className="px-2 py-1 text-xs border border-border rounded-md text-text-secondary hover:text-text-primary shrink-0"
                          title="Flip +/- sign"
                        >
                          +/−
                        </button>
                      </div>
                      <input
                        type="date"
                        value={trade.date}
                        onChange={(e) => updateTrade(trade.id, { date: e.target.value })}
                        className="input-field text-sm"
                      />
                      <select
                        value={trade.side ?? 'long'}
                        onChange={(e) => updateTrade(trade.id, { side: e.target.value as TradeSide })}
                        className="input-field text-sm"
                      >
                        <option value="long">Long</option>
                        <option value="short">Short</option>
                      </select>
                    </div>
                  )}
                  <p className="text-[10px] text-text-secondary ml-8 mt-0.5">from {trade.sourceFile}</p>
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-yellow-400/80 mb-3">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-2.5 bg-accent text-white rounded-md font-medium hover:opacity-90 transition-opacity"
              >
                Import {selectedCount} Trade{selectedCount !== 1 ? 's' : ''}
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
