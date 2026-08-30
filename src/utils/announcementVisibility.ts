import type { Announcement } from '../services/announcement';
import { navigateToPath } from './navigateToPath';

/**
 * Whether this browser should see this banner.
 *
 * Its own module, with no runtime imports, because the "it comes back if it changes" rule is the
 * whole feature and is worth testing directly rather than through a rendered component.
 *
 * The comparison is `dismissed < revision`, not a boolean flag: a dismissal recorded against
 * revision 3 says nothing about revision 4, so any edit — including a typo fix — shows the banner
 * again to everyone who had closed the previous one.
 */
export function shouldShowAnnouncement(
  announcement: Announcement | null,
  dismissedRev: number,
): boolean {
  if (!announcement || !announcement.enabled) return false;
  if (!announcement.title.trim()) return false;
  return dismissedRev < announcement.revision;
}

/**
 * Runs the banner's button.
 *
 * The destination is an enum rather than a path the admin types, so nothing arbitrary can be
 * routed to — and an external link opens with noopener, since it's a link one person typed into a
 * box that everyone else then clicks.
 */
export function runAnnouncementCta(
  announcement: Announcement,
  handlers: { onConnectBroker?: () => void } = {},
): void {
  switch (announcement.cta) {
    case 'connect-broker':
      handlers.onConnectBroker?.();
      break;
    case 'pricing':
      navigateToPath('/pricing');
      break;
    case 'help-center':
      navigateToPath('/help-center');
      break;
    case 'whats-new':
      navigateToPath('/whats-new');
      break;
    case 'url':
      if (announcement.ctaUrl) window.open(announcement.ctaUrl, '_blank', 'noopener,noreferrer');
      break;
    default:
      break;
  }
}

/** True when the banner should render a button at all. */
export function hasAnnouncementCta(announcement: Announcement): boolean {
  return announcement.cta !== 'none' && announcement.ctaLabel.trim().length > 0;
}
