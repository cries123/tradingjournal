import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheKindFor } from './firestoreTabs';
import {
  __resetFirestoreLatchForTests,
  isFirestoreLatchError,
  noteFirestoreFailure,
  RELOAD_GUARD_MS,
  shouldReloadNow,
  subscribeFirestoreLatch,
} from './firestoreLatch';

/*
 * The iPhone Firestore crash: Safari ends the on-disk cache's transaction when the app is
 * backgrounded ("Attempt to get records from database without an in-progress transaction"), the
 * SDK asserts (ID: 90f9), and then refuses all further work (ID: b815). Two answers: WebKit gets
 * no disk cache to break, and a latched page reloads itself the moment nobody is looking.
 */

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  // Added to the home screen, and opened from a link inside the Reddit or Instagram app: both are
  // WebKit with no "Safari/" in the string, so only the device check catches them.
  iphoneHomeScreen:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneInAppBrowser:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Reddit/Version 2025.40.0/Build 1234567',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
};

describe('cacheKindFor', () => {
  it('gives every iPhone browser the in-memory cache, since they are all WebKit', () => {
    expect(cacheKindFor(UA.iphoneSafari, 5)).toBe('memory');
    expect(cacheKindFor(UA.iphoneChrome, 5)).toBe('memory');
  });

  it('catches the home-screen app and in-app browsers, which do not call themselves Safari', () => {
    expect(cacheKindFor(UA.iphoneHomeScreen, 5)).toBe('memory');
    expect(cacheKindFor(UA.iphoneInAppBrowser, 5)).toBe('memory');
  });

  it('catches an iPad that asks for the desktop site by its touch screen', () => {
    expect(cacheKindFor(UA.ipadDesktopMode, 5)).toBe('memory');
    // On the home screen it drops "Safari/" as well, leaving the touch screen as the only tell.
    const ipadHomeScreen = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
    expect(cacheKindFor(ipadHomeScreen, 5)).toBe('memory');
  });

  it('gives Safari on a Mac the in-memory cache too', () => {
    expect(cacheKindFor(UA.macSafari, 0)).toBe('memory');
  });

  it('keeps the on-disk cache for Chrome, Edge, Firefox and Android', () => {
    expect(cacheKindFor(UA.macChrome, 0)).toBe('persistent');
    expect(cacheKindFor(UA.windowsEdge, 0)).toBe('persistent');
    expect(cacheKindFor(UA.windowsFirefox, 0)).toBe('persistent');
    expect(cacheKindFor(UA.androidChrome, 5)).toBe('persistent');
  });

  it('is what the Firestore setup actually uses', () => {
    const source = readFileSync('src/lib/firebase.ts', 'utf8');
    expect(source).toContain('cacheKindFor(navigator.userAgent');
    expect(source).toMatch(/kind === 'memory'\s*\?\s*memoryLocalCache\(\)/);
    expect(source).not.toContain('persistentSingleTabManager');
  });
});

describe('the latched-client signal', () => {
  afterEach(() => __resetFirestoreLatchForTests());

  const b7de = new Error('FIRESTORE (12.19.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b7de) CONTEXT: {"batchId":2}');
  const b815 = new Error('FIRESTORE (12.19.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)');
  const safari = Object.assign(new Error('Attempt to get records from database without an in-progress transaction'), {
    name: 'UnknownError',
  });
  const wrapped = Object.assign(new Error("IndexedDB transaction 'Get next mutation batch' failed: AbortError"), {
    name: 'IndexedDbTransactionError',
  });

  it('recognises the SDK’s assertion, Safari’s dropped transaction in both its shapes, and nothing else', () => {
    expect(isFirestoreLatchError(b7de)).toBe(true);
    expect(isFirestoreLatchError(b815.message)).toBe(true);
    expect(isFirestoreLatchError(safari)).toBe(true);
    expect(isFirestoreLatchError(wrapped)).toBe(true);
    expect(isFirestoreLatchError(new Error('Failed to fetch'))).toBe(false);
    expect(isFirestoreLatchError({ code: 'permission-denied' })).toBe(false);
    expect(isFirestoreLatchError(undefined)).toBe(false);
  });

  it('tells the journal once, on the first latch, and ignores the ones that follow', () => {
    const heard = vi.fn();
    subscribeFirestoreLatch(heard);
    noteFirestoreFailure(new Error('Failed to fetch'));
    noteFirestoreFailure(safari);
    noteFirestoreFailure(b7de);
    noteFirestoreFailure(b815);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(safari);
  });

  it('tells a journal that mounts after the client already broke', () => {
    noteFirestoreFailure(b7de);
    const heard = vi.fn();
    subscribeFirestoreLatch(heard);
    expect(heard).toHaveBeenCalledWith(b7de);
  });

  it('stops telling a journal that has gone', () => {
    const heard = vi.fn();
    const stop = subscribeFirestoreLatch(heard);
    stop();
    noteFirestoreFailure(b7de);
    expect(heard).not.toHaveBeenCalled();
  });

  it('is fed by both global error listeners, and the recovery is installed with them', () => {
    const source = readFileSync('src/services/errorReporting.ts', 'utf8');
    expect(source).toContain('noteFirestoreFailure(event.error ?? event.message)');
    expect(source).toContain('noteFirestoreFailure(event.reason)');
    expect(source).toContain('installFirestoreRecovery(');
  });
});

describe('reloading a latched page', () => {
  const T = 1_800_000_000_000;

  it('reloads only while nobody is looking', () => {
    expect(shouldReloadNow('hidden', null, T)).toBe(true);
    expect(shouldReloadNow('visible', null, T)).toBe(false);
  });

  it('never reloads twice inside the guard window, so a broken build cannot loop', () => {
    expect(shouldReloadNow('hidden', T, T + RELOAD_GUARD_MS - 1)).toBe(false);
    expect(shouldReloadNow('hidden', T, T + RELOAD_GUARD_MS)).toBe(true);
  });
});
