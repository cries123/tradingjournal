import { Megaphone, ShieldCheck, X } from 'lucide-react';
import type { Announcement, AnnouncementTone } from '../services/announcement';
import { useAnnouncement } from '../hooks/useAnnouncement';
import { hasAnnouncementCta, runAnnouncementCta } from '../utils/announcementVisibility';

const TONE: Record<AnnouncementTone, { wrap: string; icon: string; link: string }> = {
  info: {
    wrap: 'border-accent/30 bg-accent/5',
    icon: 'bg-accent/15 border-accent/30 text-accent',
    link: 'text-accent hover:text-accent/80',
  },
  success: {
    wrap: 'border-emerald-400/30 bg-emerald-400/5',
    icon: 'bg-emerald-400/15 border-emerald-400/30 text-emerald-400',
    link: 'text-emerald-400 hover:text-emerald-300',
  },
  warning: {
    wrap: 'border-amber-400/30 bg-amber-400/5',
    icon: 'bg-amber-400/15 border-amber-400/30 text-amber-300',
    link: 'text-amber-300 hover:text-amber-200',
  },
};

interface SiteAnnouncementProps {
  /** Used for the "connect a broker" CTA, which is an in-app view rather than a route. */
  onConnectBroker?: () => void;
  /** Lets the admin preview render without touching Firestore or localStorage. */
  preview?: Announcement;
}

/**
 * The banner at the top of the dashboard, written from the admin panel.
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

  const tone = TONE[announcement.tone];

  const showCta = hasAnnouncementCta(announcement);
  const short = announcement.bodyShort.trim() || announcement.body;

  return (
    <div
      className={`relative flex flex-wrap items-start gap-3 rounded-xl border pl-4 pr-9 py-3.5 shrink-0 ${tone.wrap}`}
    >
      <div
        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${tone.icon}`}
      >
        <Megaphone size={16} />
      </div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-text-primary">{announcement.title}</p>
        {announcement.body.trim() && (
          <p className="text-xs text-text-secondary leading-relaxed mt-0.5 max-w-2xl hidden sm:block">
            {announcement.body}
          </p>
        )}
        {/* Phones get the short version. A full paragraph above someone's own P&L costs half a
            screen, and the detail is one tap away wherever the button goes. */}
        {short.trim() && (
          <p className="text-xs text-text-secondary leading-relaxed mt-0.5 sm:hidden">{short}</p>
        )}
        {showCta && (
          <button
            type="button"
            onClick={() => runAnnouncementCta(announcement, { onConnectBroker })}
            className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium transition-colors focus-ring rounded ${tone.link}`}
          >
            <ShieldCheck size={13} />
            {announcement.ctaLabel} →
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={live.dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
      >
        <X size={14} />
      </button>
    </div>
  );
}
