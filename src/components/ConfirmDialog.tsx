import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

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
  useEscapeToClose(onCancel);

  /*
   * Rendered into document.body rather than where it is written.
   *
   * position:fixed is relative to the viewport only until an ancestor has a filter, a
   * transform or a backdrop-filter, any of which makes that ancestor the containing block
   * instead. .glass-card carries backdrop-filter: blur(12px), so every confirmation opened
   * from inside one — the admin user modal, among others — was being positioned against a
   * panel that is max-h-[85vh] and overflow-y-auto.
   *
   * On a wide screen the panel is big enough that the dialog still landed somewhere visible.
   * On a phone, with the panel scrolled down, it opened above the visible area: the button
   * appeared to do nothing at all. A portal is the fix that holds wherever this is used, which
   * matters more than fixing the one caller that exposed it.
   */
  const dialog = (
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

  /* Inline when there is no document: renderToString cannot render a portal, and several of
     this repo’s first-paint tests render surfaces that contain one. */
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
