import { Camera, FileSpreadsheet, Plus, Sparkles } from 'lucide-react';

interface EmptyDashboardProps {
  onAddTrade: () => void;
  onImportCsv: () => void;
  onImportScreenshot: () => void;
  onLoadSample?: () => void;
}

export function EmptyDashboard({ onAddTrade, onImportCsv, onImportScreenshot, onLoadSample }: EmptyDashboardProps) {
  return (
    <div className="panel-card p-6 md:p-8 text-center shrink-0">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4">
        <Plus size={28} className="text-emerald-400" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Start your journal</h3>
      <p className="text-sm text-text-secondary max-w-sm mx-auto mb-6 leading-relaxed">
        Import this month&apos;s trades or log your first session — your calendar and stats will populate instantly.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center max-w-md mx-auto">
        <button type="button" onClick={onImportCsv} className="flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm flex-1">
          <FileSpreadsheet size={16} />
          Import CSV
        </button>
        <button type="button" onClick={onImportScreenshot} className="flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm flex-1">
          <Camera size={16} />
          Screenshot
        </button>
        <button type="button" onClick={onAddTrade} className="flex items-center justify-center gap-2 btn-primary py-2.5 text-sm flex-1">
          <Plus size={16} />
          Log trade
        </button>
      </div>
      {onLoadSample && (
        <button
          type="button"
          onClick={onLoadSample}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 hover:underline transition-colors focus-ring rounded px-1 py-0.5"
        >
          <Sparkles size={14} />
          Or explore with an example month
        </button>
      )}
    </div>
  );
}
