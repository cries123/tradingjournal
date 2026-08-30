import { useCallback, useEffect, useState } from 'react';
import { fetchAnnouncement, type Announcement } from '../services/announcement';
import { shouldShowAnnouncement } from '../utils/announcementVisibility';

const STORAGE_KEY = 'trend-chasers-announcement-dismissed-revision';

/** The revision this browser has dismissed, or -1 for none. */
function dismissedRevision(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return -1;
    const n = Number(raw);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

/**
 * The published announcement, and whether this browser should be shown it.
 *
 * Shared by the slim bar at the top of the public site and the card on the dashboard, so the two
 * can't disagree — and so dismissing it in one place dismisses it in both. It's one message; being
 * asked to close it twice would be the wrong behaviour.
 */
export function useAnnouncement(): {
  announcement: Announcement | null;
  visible: boolean;
  dismiss: () => void;
} {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<number>(dismissedRevision);

  useEffect(() => {
    let cancelled = false;
    void fetchAnnouncement().then((a) => {
      if (!cancelled) setAnnouncement(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    if (!announcement) return;
    setDismissed(announcement.revision);
    try {
      localStorage.setItem(STORAGE_KEY, String(announcement.revision));
    } catch {
      // Best effort — worst case it reappears next visit.
    }
  }, [announcement]);

  return { announcement, visible: shouldShowAnnouncement(announcement, dismissed), dismiss };
}
