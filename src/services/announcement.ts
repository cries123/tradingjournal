import { isFirebaseConfigured } from '../lib/firebaseAuth';
// The landing page's banner reads this, so Firestore arrives on demand — see lib/lazyFirestore.ts.
import { lazyFirestore } from '../lib/lazyFirestore';

export type AnnouncementTone = 'info' | 'success' | 'warning';

/**
 * How it is shown. A banner sits at the top of the page until it is closed; a pop-up is a card in
 * the middle of the screen, once — the format for a launch or an offer, where a line at the top of
 * the page is too easy to scroll past.
 */
export type AnnouncementDisplay = 'banner' | 'modal';

/** Where the banner's button sends people. A fixed list, not a free-form path, so a typo in the
 *  admin panel can't produce a dead link — and so nothing arbitrary can be injected into a nav. */
export type AnnouncementCta = 'none' | 'connect-broker' | 'pricing' | 'help-center' | 'whats-new' | 'url';

export interface Announcement {
  enabled: boolean;
  title: string;
  /** The full message. Shown from the `sm` breakpoint up. */
  body: string;
  /** The phone version. Falls back to `body` when empty. */
  bodyShort: string;
  tone: AnnouncementTone;
  /** Absent on everything published before pop-ups existed, which reads as 'banner'. */
  display: AnnouncementDisplay;
  cta: AnnouncementCta;
  ctaLabel: string;
  /** Only used when cta === 'url'. */
  ctaUrl: string;
  /**
   * Bumped on every save. This is what makes "it comes back if it changes" work: the dismissal is
   * stored against the revision that was dismissed, so a new revision is, correctly, something
   * nobody has dismissed yet.
   */
  revision: number;
  updatedAt: string;
}

export const EMPTY_ANNOUNCEMENT: Announcement = {
  enabled: false,
  title: '',
  body: '',
  bodyShort: '',
  tone: 'info',
  display: 'banner',
  cta: 'none',
  ctaLabel: '',
  ctaUrl: '',
  revision: 0,
  updatedAt: '',
};

const CACHE_KEY = 'trend-chasers-announcement-cache';
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Cached for five minutes per browser.
 *
 * Every visitor loading this on every page view is a Firestore read, and this site has already
 * been taken down once by exhausting the daily read quota. Five minutes is the delay between
 * publishing a change and everyone seeing it, which for a banner is nothing.
 */
function readCache(): Announcement | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: Announcement };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache(value: Announcement): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Private browsing, or storage full. The banner just re-fetches next time.
  }
}

/** Only the shapes we accept — exported so the "old documents read as a banner" rule is tested. */
export function normalizeAnnouncement(data: Partial<Announcement>): Announcement {
  return {
    enabled: data.enabled === true,
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    bodyShort: typeof data.bodyShort === 'string' ? data.bodyShort : '',
    tone: data.tone === 'success' || data.tone === 'warning' ? data.tone : 'info',
    display: data.display === 'modal' ? 'modal' : 'banner',
    cta:
      data.cta === 'connect-broker' ||
      data.cta === 'pricing' ||
      data.cta === 'help-center' ||
      data.cta === 'whats-new' ||
      data.cta === 'url'
        ? data.cta
        : 'none',
    ctaLabel: typeof data.ctaLabel === 'string' ? data.ctaLabel : '',
    ctaUrl: typeof data.ctaUrl === 'string' ? data.ctaUrl : '',
    revision: typeof data.revision === 'number' ? data.revision : 0,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
  };
}

export async function fetchAnnouncement(options?: { fresh?: boolean }): Promise<Announcement> {
  if (!isFirebaseConfigured()) return EMPTY_ANNOUNCEMENT;

  if (!options?.fresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  try {
    const { fs, db } = await lazyFirestore();
    const snap = await fs.getDoc(fs.doc(db, 'config', 'announcement'));
    const value = snap.exists() ? normalizeAnnouncement(snap.data() as Partial<Announcement>) : EMPTY_ANNOUNCEMENT;
    writeCache(value);
    return value;
  } catch {
    // An unreadable banner is not worth an error state on someone's dashboard.
    return EMPTY_ANNOUNCEMENT;
  }
}

/**
 * Publishes the banner. Admin only — enforced by the Firestore rules, not by this function.
 *
 * The revision bump is unconditional on purpose. Editing a typo and re-publishing shows the
 * banner again to everyone who had dismissed it, which is the behaviour that was asked for: if
 * you changed it, it's new, and people who dismissed the old one haven't seen it.
 */
export async function saveAnnouncement(
  next: Omit<Announcement, 'revision' | 'updatedAt'>,
  currentRevision: number,
): Promise<Announcement> {
  const value: Announcement = {
    ...next,
    revision: currentRevision + 1,
    updatedAt: new Date().toISOString(),
  };
  const { fs, db } = await lazyFirestore();
  await fs.setDoc(fs.doc(db, 'config', 'announcement'), value);
  writeCache(value);
  return value;
}
