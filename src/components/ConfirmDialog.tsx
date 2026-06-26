import { X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-backdrop-in" onClick={onCancel}>
      <div
        className="bg-bg-secondary border border-border rounded-xl p-6 w-full max-w-sm shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="confirm-title"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <h3 id="confirm-title" className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onCancel} className="p-1 text-text-secondary hover:text-text-primary focus-ring rounded" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${
              danger ? 'bg-loss text-white hover:opacity-90' : 'btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 btn-secondary text-sm">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
