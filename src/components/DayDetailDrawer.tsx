import { useEffect, useMemo, useState } from 'react';
import { Camera, FileText, Pencil, Plus, Share2, X } from 'lucide-react';
import { TradeListItem } from './TradeListItem';
import { ShareCardModal } from './ShareCardModal';
import type { Trade } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { fetchDayNote, saveDayNote } from '../services/dayNotes';
import { formatCurrency } from '../utils/format';
import { computeStats } from '../utils/stats';

interface DayDetailDrawerProps {
  date: string;
  trades: Trade[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (trade: Trade) => void;
  onAddTrade: () => void;
  onImportCsv: () => void;
  onImportScreenshot: () => void;
}

export function DayDetailDrawer({
  date,
  trades,
  onClose,
  onDelete,
  onEdit,
  onAddTrade,
  onImportCsv,
  onImportScreenshot,
}: DayDetailDrawerProps) {
  const { settings } = useSettings();
  const { user, firebaseEnabled } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [discipline, setDiscipline] = useState<number | null>(null);
  const [noteLoadedFor, setNoteLoadedFor] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const noteUid = firebaseEnabled && user ? user.uid : null;
  const noteLoading = noteLoadedFor !== date;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDayNote(noteUid, date)
      .then((note) => {
        if (cancelled) return;
        setNoteDraft(note?.note ?? '');
        setDiscipline(note?.discipline ?? null);
        setNoteLoadedFor(date);
      })
      .catch(() => {
        if (cancelled) return;
        setNoteDraft('');
        setDiscipline(null);
        setNoteLoadedFor(date);
      });
    return () => {
      cancelled = true;
    };
  }, [noteUid, date]);

  const persistNote = async (nextNote: string, nextDiscipline: number | null) => {
    setNoteStatus('saving');
    try {
      await saveDayNote(noteUid, date, nextNote, nextDiscipline ?? undefined);
      setNoteStatus('saved');
      setTimeout(() => setNoteStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch {
      setNoteStatus('error');
    }
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const dayTrades = trades.filter((t) => t.date === date);
  const dayStats = useMemo(() => computeStats(dayTrades), [dayTrades]);
  const totalPnl = dayStats.netPnl;
  const [year, month] = date.split('-').map(Number);
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

        {dayTrades.length > 0 && (
          <div className="px-5 pb-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowShare(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border border-emerald-500/30 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors focus-ring"
            >
              <Share2 size={16} />
              Share session
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-5 pb-5 border-b border-border/50">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                Session notes
              </p>
              <span className="text-[10px] text-text-secondary">
                {noteStatus === 'saving' && 'Saving…'}
                {noteStatus === 'saved' && <span className="text-emerald-400">Saved</span>}
                {noteStatus === 'error' && <span className="text-red-400">Could not save</span>}
              </span>
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => void persistNote(noteDraft, discipline)}
              disabled={noteLoading}
              rows={3}
              placeholder="How did the session go? What worked, what will you do differently…"
              className="input-field text-sm w-full resize-y min-h-[72px]"
              aria-label="Session notes"
            />
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-[10px] uppercase tracking-wide text-text-secondary">Discipline</span>
              <div className="flex gap-1" role="radiogroup" aria-label="Discipline rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={discipline === n}
                    onClick={() => {
                      const next = discipline === n ? null : n;
                      setDiscipline(next);
                      void persistNote(noteDraft, next);
                    }}
                    className={`w-7 h-7 rounded-md text-xs font-semibold transition-colors focus-ring ${
                      discipline != null && n <= discipline
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                        : 'bg-bg-tertiary/60 text-text-secondary border border-border/40 hover:text-text-primary'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(trade);
                        }}
                        className="text-text-secondary hover:text-emerald-400 p-1 focus-ring rounded"
                        aria-label="Edit trade"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(trade.id);
                        }}
                        className="text-text-secondary hover:text-loss-bright p-1 focus-ring rounded"
                        aria-label="Delete trade"
                      >
                        <X size={14} />
                      </button>
                    </div>
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

      {showShare && dayTrades.length > 0 && (
        <ShareCardModal
          period="day"
          stats={dayStats}
          dateKey={date}
          year={year}
          month={month - 1}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}
