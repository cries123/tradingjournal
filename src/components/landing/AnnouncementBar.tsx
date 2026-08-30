import { Sparkles, X } from 'lucide-react';
import type { Announcement, AnnouncementTone } from '../../services/announcement';
import { useAnnouncement } from '../../hooks/useAnnouncement';
import { hasAnnouncementCta, runAnnouncementCta } from '../../utils/announcementVisibility';

const TONE: Record<AnnouncementTone, { wrap: string; icon: string; lead: string; link: string }> = {
  info: {
    wrap: 'border-accent/30 bg-accent/10',
    icon: 'text-accent',
    lead: 'text-accent',
    link: 'text-accent hover:text-accent/80',
  },
  success: {
    wrap: 'border-emerald-500/30 bg-emerald-500/10',
    icon: 'text-emerald-400',
    lead: 'text-emerald-300',
    link: 'text-emerald-300 hover:text-emerald-200',
  },
  warning: {
    wrap: 'border-amber-400/30 bg-amber-400/10',
    icon: 'text-amber-400',
    lead: 'text-amber-300',
    link: 'text-amber-300 hover:text-amber-200',
  },
};

interface AnnouncementBarProps {
  /** Renders a fixed announcement instead of the published one, for the admin preview. */
  preview?: Announcement;
}

/**
 * The slim bar across the very top of the public site, written from the admin panel.
 *
 * Same message and same dismissal as the dashboard card (see useAnnouncement) — one announcement,
 * closed once. The bar leads with the headline and keeps the body on one line, because it sits
 * above the hero and anything taller pushes the whole page down.
 */
export function AnnouncementBar({ preview }: AnnouncementBarProps) {
  const live = useAnnouncement();

  const announcement = preview ?? live.announcement;
  const visible = preview ? Boolean(preview.title.trim()) : live.visible;

  if (!announcement || !visible) return null;

  const tone = TONE[announcement.tone];
  const short = announcement.bodyShort.trim() || announcement.body.trim();

  return (
    <div className={`relative z-20 border-b ${tone.wrap}`}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-2.5 flex items-center gap-3 text-sm">
        <Sparkles size={16} className={`shrink-0 ${tone.icon}`} aria-hidden />
        <p className="flex-1 min-w-0 leading-snug text-text-primary">
          <span className={`font-semibold ${tone.lead}`}>{announcement.title}</span>
          {short && <span className="text-text-secondary"> — {short}</span>}
          {hasAnnouncementCta(announcement) && (
            <button
              type="button"
              onClick={() => runAnnouncementCta(announcement)}
              className={`ml-1.5 font-medium underline underline-offset-2 whitespace-nowrap ${tone.link}`}
            >
              {announcement.ctaLabel} →
            </button>
          )}
        </p>
        <button
          type="button"
          onClick={live.dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 p-1 rounded text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors focus-ring"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
