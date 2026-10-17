import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Announcement, AnnouncementTone } from '../services/announcement';
import { hasAnnouncementCta } from '../utils/announcementVisibility';
import { useAnimatedClose } from '../hooks/useAnimatedClose';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

/** The glow the mark sits in. Lime is good news, amber a heads-up, white plain information. */
const GLOW: Record<AnnouncementTone, string> = {
  success: 'rgba(122, 255, 69, 0.55)',
  warning: 'rgba(251, 191, 36, 0.5)',
  info: 'rgba(255, 255, 255, 0.28)',
};

/* Bar heights for the skyline behind the mark — the same silhouette as the landing page's hero. */
const BARS = [0.35, 0.55, 0.42, 0.7, 0.5, 0.85, 0.62, 0.95];

interface AnnouncementModalProps {
  announcement: Announcement;
  onDismiss: () => void;
  onCta: () => void;
  /** Drawn in place, without the overlay — the admin panel's preview. */
  inline?: boolean;
}

/**
 * The announcement as a pop-up card, once — chosen per announcement in the admin panel.
 *
 * For a launch or an offer, where a line at the top of the page is too easy to scroll past: a
 * visual on top (the mark in a glow over a skyline of P&L bars, tinted by the tone), the headline
 * large, the message, one lime button and a quiet way out. It waits a moment after the page loads
 * so it lands on a page the visitor has already seen, not in front of a blank one.
 *
 * Every way out — the X, "Not now", the backdrop, Escape, and the button itself — goes through the
 * animated close and records the dismissal, so it never comes back for this revision. The button
 * dismisses too: somebody who took the offer has seen it.
 */
export function AnnouncementModal({ announcement, onDismiss, onCta, inline = false }: AnnouncementModalProps) {
  const { closing, close } = useAnimatedClose(onDismiss);
  // Live only: the preview is drawn at once, and the escape key belongs to the admin page there.
  useEscapeToClose(close, !inline);
  const [shown, setShown] = useState(inline);

  useEffect(() => {
    if (inline) return;
    const t = window.setTimeout(() => setShown(true), 900);
    return () => window.clearTimeout(t);
  }, [inline]);

  if (!shown) return null;

  const showCta = hasAnnouncementCta(announcement);
  const short = announcement.bodyShort.trim() || announcement.body.trim();

  const card = (
    <div
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-labelledby={inline ? undefined : 'announcement-modal-title'}
      onClick={(e) => e.stopPropagation()}
      className={`relative w-full max-w-[380px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0d0d] shadow-[0_40px_120px_rgba(0,0,0,0.75)] ${
        inline ? '' : closing ? 'animate-scale-out' : 'animate-scale-in'
      }`}
    >
      <div className="relative h-48 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 70% 85% at 50% 100%, ${GLOW[announcement.tone]}, transparent 70%)` }}
        />
        <div className="absolute inset-x-6 bottom-0 flex h-full items-end gap-2">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-xl bg-gradient-to-b from-white/[0.07] to-transparent"
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
        <img
          src="/logo-mark.svg"
          alt=""
          className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-[40%] drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
        />
      </div>

      {!inline && (
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 focus-ring"
        >
          <X size={18} />
        </button>
      )}

      <div className="px-6 pb-6 pt-2 text-center">
        <h2 id="announcement-modal-title" className="public-display text-[1.75rem]">
          {announcement.title}
        </h2>
        {announcement.body.trim() && (
          <p className="mt-3 hidden text-sm leading-relaxed text-text-secondary sm:block">{announcement.body}</p>
        )}
        {short && <p className="mt-3 text-sm leading-relaxed text-text-secondary sm:hidden">{short}</p>}

        <div className="mt-6 flex flex-col items-center gap-2">
          {showCta ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onCta();
                  close();
                }}
                className="btn-primary w-full py-3 text-base"
              >
                {announcement.ctaLabel}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-full px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors focus-ring"
              >
                Not now
              </button>
            </>
          ) : (
            <button type="button" onClick={close} className="btn-secondary w-full py-3 text-base">
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (inline) return <div className="flex justify-center">{card}</div>;

  const overlay = (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 ${
        closing ? 'animate-backdrop-out' : 'animate-backdrop-in'
      }`}
      onClick={close}
    >
      {card}
    </div>
  );

  // Portalled so no ancestor with a transform or filter can become its containing block. Inline
  // when there is no document, since renderToString cannot render a portal.
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}
