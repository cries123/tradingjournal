/**
 * Which kind of local cache Firestore gets in this browser.
 *
 * The on-disk cache (IndexedDB) is what makes the journal cheap: the first load pays for the
 * documents once and later loads read from the phone. Safari breaks it. iOS ends an IndexedDB
 * transaction when the app is backgrounded or the phone locks, and Firestore cannot carry on
 * after that: the admin errors on iPhones read "Attempt to get records from database without an
 * in-progress transaction" (Safari's own wording), then "INTERNAL ASSERTION FAILED (ID: 90f9)"
 * (the SDK finding the write it was tracking gone), then "(ID: b815)" on everything after — the
 * tab's client is finished until a reload, and the journal silently stops saving.
 *
 * The first attempt at this (a single-tab manager, so no lease to lose) did not help: the
 * errors kept arriving on the build that carried it. So WebKit gets no on-disk cache at all. An
 * in-memory cache has nothing for Safari to break. The cost is that every open of the app on an
 * iPhone reads the journal from the server rather than from the phone — a few hundred reads for
 * a few hundred trades — and that a trade logged with no signal and the app then closed is not
 * kept until it can send. Chrome, Edge, Firefox and Android keep the on-disk cache.
 */
export type CacheKind = 'memory' | 'persistent';

/** Every browser on iOS and iPadOS is WebKit underneath, whatever its name says. */
function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS asks for desktop sites by default and reports itself as a Mac; the touch screen is the
  // only thing that gives it away.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** Safari on a Mac: "Safari/" in the string, and none of the browsers that also carry it. */
function isDesktopSafari(userAgent: string): boolean {
  return /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\//.test(userAgent);
}

export function cacheKindFor(userAgent: string, maxTouchPoints: number): CacheKind {
  return isAppleMobile(userAgent, maxTouchPoints) || isDesktopSafari(userAgent) ? 'memory' : 'persistent';
}
