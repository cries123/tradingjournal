import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tabManagerFor } from './firestoreTabs';
import {
  __resetFirestoreLatchForTests,
  isFirestoreLatchError,
  noteFirestoreFailure,
  subscribeFirestoreLatch,
} from './firestoreLatch';

/*
 * The iPhone write-queue crash: "FIRESTORE INTERNAL ASSERTION FAILED (ID: b7de / 90f9)", then
 * "(ID: b815)" on everything after. See firestoreTabs.ts for the cause.
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

describe('tabManagerFor', () => {
  it('gives every iPhone browser the single-tab cache, since they are all WebKit', () => {
    expect(tabManagerFor(UA.iphoneSafari, 5)).toBe('single');
    expect(tabManagerFor(UA.iphoneChrome, 5)).toBe('single');
  });

  it('catches the home-screen app and in-app browsers, which do not call themselves Safari', () => {
    expect(tabManagerFor(UA.iphoneHomeScreen, 5)).toBe('single');
    expect(tabManagerFor(UA.iphoneInAppBrowser, 5)).toBe('single');
  });

  it('catches an iPad that asks for the desktop site by its touch screen', () => {
    expect(tabManagerFor(UA.ipadDesktopMode, 5)).toBe('single');
    // On the home screen it drops "Safari/" as well, leaving the touch screen as the only tell.
    const ipadHomeScreen = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
    expect(tabManagerFor(ipadHomeScreen, 5)).toBe('single');
  });

  it('gives Safari on a Mac the single-tab cache too', () => {
    expect(tabManagerFor(UA.macSafari, 0)).toBe('single');
  });

  it('keeps the shared cache for Chrome, Edge, Firefox and Android', () => {
    expect(tabManagerFor(UA.macChrome, 0)).toBe('multi');
    expect(tabManagerFor(UA.windowsEdge, 0)).toBe('multi');
    expect(tabManagerFor(UA.windowsFirefox, 0)).toBe('multi');
    expect(tabManagerFor(UA.androidChrome, 5)).toBe('multi');
  });

  it('is what the Firestore setup actually uses', () => {
    const source = readFileSync('src/lib/firebase.ts', 'utf8');
    expect(source).toContain('tabManagerFor(navigator.userAgent');
    expect(source).toContain("kind === 'single' ? persistentSingleTabManager(");
  });
});

describe('the latched-client signal', () => {
  afterEach(() => __resetFirestoreLatchForTests());

  const b7de = new Error('FIRESTORE (12.19.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b7de) CONTEXT: {"batchId":2}');
  const b815 = new Error('FIRESTORE (12.19.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)');

  it('recognises the SDK’s assertion and nothing else', () => {
    expect(isFirestoreLatchError(b7de)).toBe(true);
    expect(isFirestoreLatchError(b815.message)).toBe(true);
    expect(isFirestoreLatchError(new Error('Failed to fetch'))).toBe(false);
    expect(isFirestoreLatchError({ code: 'permission-denied' })).toBe(false);
    expect(isFirestoreLatchError(undefined)).toBe(false);
  });

  it('tells the journal once, on the first assertion, and ignores the ones that follow', () => {
    const heard = vi.fn();
    subscribeFirestoreLatch(heard);
    noteFirestoreFailure(new Error('Failed to fetch'));
    noteFirestoreFailure(b7de);
    noteFirestoreFailure(b815);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(b7de);
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

  it('is fed by both global error listeners', () => {
    const source = readFileSync('src/services/errorReporting.ts', 'utf8');
    expect(source).toContain('noteFirestoreFailure(event.error ?? event.message)');
    expect(source).toContain('noteFirestoreFailure(event.reason)');
  });
});
