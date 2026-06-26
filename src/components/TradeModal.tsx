import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import type { Trade, TradeGrade, TradeSide, AssetClass } from '../types';
import { compressImage } from '../utils/compressImage';
import { buildTradingViewReplayUrl } from '../utils/tradingView';

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

  useEffect(() => {
    if (!trade) return;
    setDate(trade.date);
    setSymbol(trade.symbol);
    setPnl(String(trade.pnl));
    setSetup(trade.setup ?? '');
    setSide(trade.side ?? 'long');
    setNotes(trade.notes ?? '');
    setExtraTags((trade.tags ?? []).join(', '));
    setStrategyId(trade.strategyId ?? '');
    setFees(trade.fees != null ? String(trade.fees) : '');
    setGrossPnl(trade.grossPnl != null ? String(trade.grossPnl) : '');
    setEntryTime(trade.entryTime ?? '');
    setExitTime(trade.exitTime ?? '');
    setMae(trade.mae != null ? String(trade.mae) : '');
    setMfe(trade.mfe != null ? String(trade.mfe) : '');
    setRMultiple(trade.rMultiple != null ? String(trade.rMultiple) : '');
    setGrade(trade.grade ?? '');
    setChecklistScore(trade.checklistScore != null ? String(trade.checklistScore) : '');
    setAssetClass(trade.assetClass ?? '');
    setIvRank(trade.ivRank != null ? String(trade.ivRank) : '');
    setImageUrls(trade.imageUrls ?? []);
    setChartUrl(trade.chartUrl ?? '');
  }, [trade]);

  const parseOptNum = (v: string) => {
    if (!v.trim()) return undefined;
    const n = parseFloat(v);
    return Number.isNaN(n) ? undefined : n;
  };

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
    let pnlValue = parseFloat(pnl);
    if (!symbol || Number.isNaN(pnlValue)) return;

    const feesVal = parseOptNum(fees);
    const grossVal = parseOptNum(grossPnl);
    if (grossVal != null && feesVal != null) pnlValue = grossVal - feesVal;

    const tags = extraTags
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .filter((t) => t !== setup.toUpperCase());

    const payload: Omit<Trade, 'id'> = {
      date,
      symbol: symbol.toUpperCase(),
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
      mae: parseOptNum(mae),
      mfe: parseOptNum(mfe),
      rMultiple: parseOptNum(rMultiple),
      grade: grade || undefined,
      checklistScore: parseOptNum(checklistScore),
      assetClass: assetClass || undefined,
      ivRank: parseOptNum(ivRank),
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
          <Field label="Symbol">
            <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="SPY" className="input-field" required />
          </Field>
          <Field label="Net P/L ($)">
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
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input-field resize-none" placeholder="Setup context, mistakes, etc." />
          </Field>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 focus-ring rounded"
          >
            <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Advanced details
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
                <Field label="Gross P/L">
                  <input type="number" step="0.01" value={grossPnl} onChange={(e) => setGrossPnl(e.target.value)} className="input-field" />
                </Field>
                <Field label="Fees">
                  <input type="number" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entry time">
                  <input type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} className="input-field" />
                </Field>
                <Field label="Exit time">
                  <input type="time" value={exitTime} onChange={(e) => setExitTime(e.target.value)} className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="MAE $">
                  <input type="number" step="0.01" value={mae} onChange={(e) => setMae(e.target.value)} className="input-field" />
                </Field>
                <Field label="MFE $">
                  <input type="number" step="0.01" value={mfe} onChange={(e) => setMfe(e.target.value)} className="input-field" />
                </Field>
                <Field label="R multiple">
                  <input type="number" step="0.1" value={rMultiple} onChange={(e) => setRMultiple(e.target.value)} className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Grade">
                  <select value={grade} onChange={(e) => setGrade(e.target.value as TradeGrade | '')} className="input-field">
                    <option value="">—</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Checklist %">
                  <input type="number" min={0} max={100} value={checklistScore} onChange={(e) => setChecklistScore(e.target.value)} className="input-field" />
                </Field>
                <Field label="IV rank">
                  <input type="number" min={0} max={100} value={ivRank} onChange={(e) => setIvRank(e.target.value)} className="input-field" />
                </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary mb-1 block">{label}</span>
      {children}
    </label>
  );
}
