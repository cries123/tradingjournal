import { ChevronRight, X } from 'lucide-react';
import type { Announcement, AnnouncementTone } from '../services/announcement';
import { useAnnouncement } from '../hooks/useAnnouncement';
import { hasAnnouncementCta, runAnnouncementCta } from '../utils/announcementVisibility';
import { AnnouncementModal } from './AnnouncementModal';

/**
 * The tone is a glow along the card's left edge and the colour of the dot — not a tinted box. A
 * whole card washed amber or green above somebody's P&L competed with the numbers it sat over.
 */
const TONE: Record<AnnouncementTone, { edge: string; dot: string }> = {
  info: { edge: 'before:bg-white/40', dot: 'bg-white' },
  success: {
    edge: 'before:bg-accent',
    dot: 'bg-accent shadow-[0_0_12px_rgba(var(--color-accent-rgb),0.7)]',
  },
  warning: {
    edge: 'before:bg-amber-400',
    dot: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]',
  },
};

interface SiteAnnouncementProps {
  /** Used for the "connect a broker" CTA, which is an in-app view rather than a route. */
  onConnectBroker?: () => void;
  /** Lets the admin preview render without touching Firestore or localStorage. */
  preview?: Announcement;
}

/**
 * The announcement at the top of the dashboard, written from the admin panel.
 *
 * A slab in the journal's own card style with the tone as a lit left edge, the headline at the
 * size of a panel title, the detail under it and the action as the same lime pill every other
 * primary action in the app uses. The old card was a tinted box with a megaphone in a smaller box
 * — chrome that announced "banner" before it said anything.
 *
 * Dismissal is stored as the revision that was dismissed rather than a boolean. Every save in the
 * admin panel bumps the revision, so a changed banner is one nobody has dismissed yet and it comes
 * back for everyone — which is the whole point of being able to edit it.
 */
export function SiteAnnouncement({ onConnectBroker, preview }: SiteAnnouncementProps) {
  const live = useAnnouncement();

  const announcement = preview ?? live.announcement;
  const visible = preview ? Boolean(preview.title.trim()) : live.visible;

  if (!announcement || !visible) return null;

  if (announcement.display === 'modal') {
    return (
      <AnnouncementModal
        announcement={announcement}
        inline={Boolean(preview)}
        onDismiss={live.dismiss}
        onCta={() => runAnnouncementCta(announcement, { onConnectBroker })}
      />
    );
  }

  const tone = TONE[announcement.tone];
  const showCta = hasAnnouncementCta(announcement);
  const short = announcement.bodyShort.trim() || announcement.body;

  return (
    <div
      role="status"
      className={`panel-card relative overflow-hidden shrink-0 pl-5 pr-11 py-4 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full ${tone.edge}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold leading-snug text-text-primary">
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
            {announcement.title}
          </p>
          {announcement.body.trim() && (
            <p className="mt-1 hidden max-w-2xl text-sm leading-relaxed text-text-secondary sm:block">
              {announcement.body}
            </p>
          )}
          {/* Phones get the short version. A full paragraph above someone's own P&L costs half a
              screen, and the detail is one tap away wherever the button goes. */}
          {short.trim() && <p className="mt-1 text-sm leading-relaxed text-text-secondary sm:hidden">{short}</p>}
        </div>
        {showCta && (
          <button
            type="button"
            onClick={() => runAnnouncementCta(announcement, { onConnectBroker })}
            className="btn-primary shrink-0 self-start px-4 py-2 text-sm sm:self-auto"
          >
            {announcement.ctaLabel}
            <ChevronRight size={15} className="ml-0.5" aria-hidden />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={live.dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-full p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors focus-ring"
      >
        <X size={14} />
      </button>
    </div>
  );
}
