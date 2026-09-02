import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useSettings } from '../context/useSettings';
import type { Trade, TradeGrade, TradeSide, AssetClass } from '../types';
import { compressImage } from '../utils/compressImage';
import { buildTradingViewReplayUrl } from '../utils/tradingView';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { readTradeForm } from '../utils/tradeFormValues';

interface TradeModalProps {
  trade?: Trade;
  defaultDate?: string;
  onClose: () => void;
  onSave: (trade: Omit<Trade, 'id'>) => void;
  onUpdate?: (trade: Trade) => void;
}

const GRADES: TradeGrade[] = ['A', 'B', 'C', 'D', 'F'];
const ASSET_CLASSES: AssetClass[] = ['stock', 'option', 'future', 'forex', 'crypto'];

export function TradeModal({ trade, defaultDate, onClose, onSave, onUpdate }: TradeModalProps) {
  useEscapeToClose(onClose);
  const isEdit = Boolean(trade);
  const { settings } = useSettings();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(trade?.date ?? defaultDate ?? today);
  const [symbol, setSymbol] = useState(trade?.symbol ?? settings.defaultSymbol);
  const [pnl, setPnl] = useState(trade ? String(trade.pnl) : '');
  const [setup, setSetup] = useState(trade?.setup ?? '');
  const [side, setSide] = useState<TradeSide>(trade?.side ?? 'long');
  const [notes, setNotes] = useState(trade?.notes ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [extraTags, setExtraTags] = useState((trade?.tags ?? []).join(', '));
  const [strategyId, setStrategyId] = useState(trade?.strategyId ?? '');
  const [fees, setFees] = useState(trade?.fees != null ? String(trade.fees) : '');
  const [grossPnl, setGrossPnl] = useState(trade?.grossPnl != null ? String(trade.grossPnl) : '');
  const [entryTime, setEntryTime] = useState(trade?.entryTime ?? '');
  const [exitTime, setExitTime] = useState(trade?.exitTime ?? '');
  const [mae, setMae] = useState(trade?.mae != null ? String(trade.mae) : '');
  const [mfe, setMfe] = useState(trade?.mfe != null ? String(trade.mfe) : '');
  const [rMultiple, setRMultiple] = useState(trade?.rMultiple != null ? String(trade.rMultiple) : '');
  const [grade, setGrade] = useState<TradeGrade | ''>(trade?.grade ?? '');
  const [checklistScore, setChecklistScore] = useState(trade?.checklistScore != null ? String(trade.checklistScore) : '');
  const [assetClass, setAssetClass] = useState<AssetClass | ''>(trade?.assetClass ?? '');
  const [ivRank, setIvRank] = useState(trade?.ivRank != null ? String(trade.ivRank) : '');
  const [imageUrls, setImageUrls] = useState<string[]>(trade?.imageUrls ?? []);
  const [chartUrl, setChartUrl] = useState(trade?.chartUrl ?? '');
  /* Errors appear only once someone has tried to save. Marking a field red while it is still
     being typed into is nagging, not help. */
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Field state is seeded straight from `trade` above. The parent remounts this
  // component (via `key={trade?.id ?? 'new'}`) whenever it switches which trade
  // is being edited, so the initializers above are all that's needed — no effect
  // resyncing state from props on every render.

  const reading = readTradeForm({
    symbol, pnl, grossPnl, fees, mae, mfe, rMultiple, checklistScore, ivRank,
  });
  const { derivedNet, netRaw, errors } = reading;

  /** So collapsing Advanced does not hide the fact that something is in there. */
  const advancedFilled = [
    extraTags, strategyId, grossPnl, fees, entryTime, exitTime,
    mae, mfe, rMultiple, grade, checklistScore, assetClass, chartUrl,
  ].filter((v) => String(v).trim()).length + imageUrls.length;

  /* Errors stay quiet until someone has actually tried to save. Marking a field red while it is
     still being typed into is nagging, not help. */
  const show = (error?: string) => (submitAttempted ? error : undefined);

  const handleImageUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: string[] = [...imageUrls];
    for (const file of Array.from(files).slice(0, 3 - imageUrls.length)) {
      const compressed = await compressImage(file, 960, 0.75);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });
      next.push(dataUrl);
    }
    setImageUrls(next.slice(0, 3));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    /* Previously this returned with no explanation, so the Save button simply did nothing and left
       the person to guess which field it disliked. */
    if (!reading.canSave || reading.net === null) {
      if (reading.advancedErrorCount > 0) setShowAdvanced(true);
      return;
    }

    const pnlValue = reading.net;
    const feesVal = reading.values.fees;
    const grossVal = reading.values.gross;

    const tags = extraTags
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .filter((t) => t !== setup.toUpperCase());

    const payload: Omit<Trade, 'id'> = {
      date,
      symbol: symbol.trim().toUpperCase(),
      pnl: pnlValue,
      setup: setup || undefined,
      side,
      notes: notes || undefined,
      tags: tags.length ? tags : undefined,
      strategyId: strategyId || undefined,
      fees: feesVal,
      grossPnl: grossVal,
      entryTime: entryTime || undefined,
      exitTime: exitTime || undefined,
      mae: reading.values.mae,
      mfe: reading.values.mfe,
      rMultiple: reading.values.rMultiple,
      grade: grade || undefined,
      checklistScore: reading.values.checklistScore,
      assetClass: assetClass || undefined,
      ivRank: reading.values.ivRank,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      chartUrl: chartUrl.trim() || undefined,
      accountId: trade?.accountId,
      contract: trade?.contract,
      assetType: trade?.assetType,
      optionType: trade?.optionType,
      expiration: trade?.expiration,
      strike: trade?.strike,
      quantity: trade?.quantity,
      mark: trade?.mark,
      tradePrice: trade?.tradePrice,
      pnlOpen: trade?.pnlOpen,
      netLiq: trade?.netLiq,
      underlyingPrice: trade?.underlyingPrice,
      delta: trade?.delta,
      gamma: trade?.gamma,
      theta: trade?.theta,
      vega: trade?.vega,
      accountType: trade?.accountType,
      roundTripId: trade?.roundTripId,
      tickValue: trade?.tickValue,
      contractSize: trade?.contractSize,
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
        className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-md shadow-xl animate-scale-in motion-safe:animate-scale-in max-h-[90vh] overflow-y-auto"
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
          <Field label="Symbol" error={show(errors.symbol)}>
            {/* iOS autocorrects tickers into words, and lower case only becomes upper on save, so
                the field disagreed with the trade it was about to write. */}
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="SPY"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(show(errors.symbol))}
              className={inputClass(show(errors.symbol))}
            />
          </Field>
          <Field
            label="Net P/L ($)"
            hint={derivedNet !== null ? undefined : 'Minus sign for a loss, e.g. -1274.22'}
            error={show(errors.pnl)}
          >
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={netRaw}
              onChange={(e) => setPnl(e.target.value)}
              readOnly={derivedNet !== null}
              placeholder="260.00"
              aria-invalid={Boolean(show(errors.pnl))}
              className={inputClass(show(errors.pnl), derivedNet !== null)}
            />
            {derivedNet !== null && (
              <p className="text-[11px] text-text-secondary mt-1">
                Gross {reading.values.gross?.toFixed(2)} &minus; fees {reading.values.fees?.toFixed(2)}. Clear
                either to type this yourself.
              </p>
            )}
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
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input-field resize-none" placeholder="Setup context, mistakes, etc." />
          </Field>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 focus-ring rounded"
          >
            <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Advanced details
            {!showAdvanced && advancedFilled > 0 && (
              <span className="text-text-secondary">· {advancedFilled} filled</span>
            )}
            {submitAttempted && reading.advancedErrorCount > 0 && (
              <span className="text-rose-300">
                · {reading.advancedErrorCount} need{reading.advancedErrorCount === 1 ? 's' : ''} fixing
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-1 border-t border-border/50">
              <Field label="Extra tags (comma-separated)">
                <input type="text" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} className="input-field" placeholder="GAP, REVERSAL" />
              </Field>
              {settings.strategies.length > 0 && (
                <Field label="Strategy">
                  <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className="input-field">
                    <option value="">None</option>
                    {settings.strategies.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <NumericField label="Gross P/L" value={grossPnl} onChange={setGrossPnl} error={show(errors.grossPnl)} placeholder="300.00" />
                <NumericField label="Fees" value={fees} onChange={setFees} error={show(errors.fees)} placeholder="5.00" />
              </div>
              {derivedNet !== null && (
                <p className="text-[11px] text-text-secondary -mt-1">
                  Net P/L above is now {derivedNet.toFixed(2)}, computed from these two.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entry time">
                  <input type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} className="input-field" />
                </Field>
                <Field label="Exit time">
                  <input type="time" value={exitTime} onChange={(e) => setExitTime(e.target.value)} className="input-field" />
                </Field>
              </div>
              {/* Stacked on a phone: three number boxes across a 390px screen left no room for the
                  labels, let alone for saying what the acronyms mean. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-2">
                <NumericField label="MAE $" hint="Worst it went against you" value={mae} onChange={setMae} error={show(errors.mae)} />
                <NumericField label="MFE $" hint="Best it got before you closed" value={mfe} onChange={setMfe} error={show(errors.mfe)} />
                <NumericField label="R multiple" hint="Result ÷ risk" value={rMultiple} onChange={setRMultiple} error={show(errors.rMultiple)} />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-2">
                <Field label="Grade">
                  <select value={grade} onChange={(e) => setGrade(e.target.value as TradeGrade | '')} className="input-field">
                    <option value="">—</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </Field>
                <NumericField label="Checklist %" value={checklistScore} onChange={setChecklistScore} error={show(errors.checklistScore)} />
                <NumericField label="IV rank" value={ivRank} onChange={setIvRank} error={show(errors.ivRank)} />
              </div>
              <Field label="Asset class">
                <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass | '')} className="input-field">
                  <option value="">—</option>
                  {ASSET_CLASSES.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </Field>
              <Field label="Chart screenshots (max 3)">
                <input type="file" accept="image/*" multiple onChange={(e) => void handleImageUpload(e.target.files)} className="text-xs text-text-secondary" />
                {imageUrls.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {imageUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded border border-border/60" />
                    ))}
                  </div>
                )}
              </Field>
              <Field label="TradingView / chart replay URL">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={chartUrl}
                    onChange={(e) => setChartUrl(e.target.value)}
                    className="input-field flex-1"
                    placeholder="https://www.tradingview.com/chart/…"
                  />
                  <button
                    type="button"
                    onClick={() => setChartUrl(buildTradingViewReplayUrl({ symbol, date, side }))}
                    className="btn-secondary px-3 py-2 text-xs shrink-0"
                  >
                    Auto-link
                  </button>
                </div>
              </Field>
            </div>
          )}

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

function inputClass(error?: string, readOnly = false): string {
  return [
    'input-field',
    error ? 'border-rose-400/60' : '',
    readOnly ? 'opacity-70 cursor-default' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary mb-1 block">{label}</span>
      {children}
      {/* The error replaces the hint rather than stacking under it — two lines of small grey and
          red text below one input is where a form starts feeling like a tax return. */}
      {error ? (
        <p className="text-[11px] text-rose-300 mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-text-secondary/70 mt-1">{hint}</p>
      ) : null}
    </label>
  );
}

/**
 * A number a person types.
 *
 * `type="number"` was the wrong control for money: it discards a pasted "$1,274.22" without a
 * word, and its spinner arrows eat width in the three-across rows. Text plus inputMode="decimal"
 * keeps the numeric keypad on a phone while letting the field hold what someone actually pasted,
 * and parseMoneyInput does the reading.
 */
function NumericField({
  label,
  hint,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={inputClass(error)}
      />
    </Field>
  );
}
