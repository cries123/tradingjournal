/**
 * Which kind of on-device cache Firestore gets in this browser.
 *
 * The multi-tab manager lets several tabs share one IndexedDB cache by electing a "primary" tab
 * that owns the queue of unsent writes, and it keeps that election alive with a heartbeat on a
 * timer. iOS freezes a backgrounded tab's timers outright, and Safari on a Mac throttles them hard,
 * so the heartbeat stops while the tab still believes it is primary. Another tab — or the same page
 * restored from the back/forward cache — sees the lease lapse and takes over. Now two clients
 * process the same write queue: one deletes a save the server just confirmed, the other goes to
 * delete it too and finds nothing.
 *
 * That is exactly what the admin errors showed, all from iPhones: "INTERNAL ASSERTION FAILED
 * (ID: b7de)" is the SDK finding zero rows where it expected the confirmed batch, and "(ID: 90f9)"
 * is the same for a rejected one. After either, Firestore refuses all further work in that tab
 * ("(ID: b815)"), so the journal silently stops saving until a reload.
 *
 * The single-tab manager has no shared election: the first tab owns the cache outright, and a
 * second tab cannot get it, at which point the SDK falls back to an in-memory cache for that tab
 * (FAILED_PRECONDITION is on its list of errors it falls back from). The cost is that a second
 * Safari tab reads the journal from the server instead of from disk. Two tabs of the journal on a
 * phone is rare; a journal that stops saving is not, so WebKit browsers take that trade. Chrome,
 * Edge and Firefox keep the shared cache, which is where the pinned-tab-plus-a-second-tab habit
 * the multi-tab manager was chosen for actually lives.
 */
export type TabManagerKind = 'single' | 'multi';

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

export function tabManagerFor(userAgent: string, maxTouchPoints: number): TabManagerKind {
  return isAppleMobile(userAgent, maxTouchPoints) || isDesktopSafari(userAgent) ? 'single' : 'multi';
}
