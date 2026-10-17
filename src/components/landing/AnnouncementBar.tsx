import { ChevronRight, X } from 'lucide-react';
import type { Announcement, AnnouncementTone } from '../../services/announcement';
import { useAnnouncement } from '../../hooks/useAnnouncement';
import { hasAnnouncementCta, runAnnouncementCta } from '../../utils/announcementVisibility';
import { AnnouncementModal } from '../AnnouncementModal';

/** One dot carries the tone. Lime is the brand's "good news", amber the "heads up". */
const DOT: Record<AnnouncementTone, string> = {
  info: 'bg-white',
  success: 'bg-accent shadow-[0_0_12px_rgba(var(--color-accent-rgb),0.7)]',
  warning: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]',
};

interface AnnouncementBarProps {
  /** Renders a fixed announcement instead of the published one, for the admin preview. */
  preview?: Announcement;
  /** For a "Connect broker" button, which on the public site opens the journal on that screen. */
  onConnectBroker?: () => void;
}

/**
 * The announcement on the public site, written from the admin panel.
 *
 * A floating pill under the nav rather than a tinted strip across the top of the page. The strip
 * was a web-page convention — a coloured band with an icon in it — and on a black site it read as
 * a browser warning. This is a dark pill with one glowing dot for the tone, the headline in white,
 * the detail in grey and the action in lime: the same vocabulary as the chips and the buttons
 * below it, so it reads as part of the page rather than something stuck on top of it.
 *
 * Same message and same dismissal as the dashboard card (see useAnnouncement) — one announcement,
 * closed once.
 */
export function AnnouncementBar({ preview, onConnectBroker }: AnnouncementBarProps) {
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

  const short = announcement.bodyShort.trim() || announcement.body.trim();

  return (
    <div className="relative z-20 px-4 pt-4">
      <div
        role="status"
        className="mx-auto flex w-fit max-w-3xl items-center gap-3 rounded-full border border-white/8 bg-[#141414] py-2 pl-4 pr-2 text-sm shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[announcement.tone]}`} aria-hidden />
        <p className="min-w-0 leading-snug">
          <span className="font-semibold text-text-primary">{announcement.title}</span>
          {short && (
            <span className="text-text-secondary">
              {' '}
              <span className="hidden sm:inline">— {short}</span>
            </span>
          )}
        </p>
        {hasAnnouncementCta(announcement) && (
          <button
            type="button"
            onClick={() => runAnnouncementCta(announcement, { onConnectBroker })}
            className="public-link shrink-0 whitespace-nowrap text-sm"
          >
            {announcement.ctaLabel}
            <ChevronRight size={15} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={live.dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 rounded-full p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors focus-ring"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
