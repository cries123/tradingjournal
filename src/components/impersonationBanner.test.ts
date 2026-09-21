import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

/*
 * The banner renders on every route, so a throw inside it is not a broken banner — it is a blank
 * app. That is worth a first-paint test on its own.
 *
 * It also reads sessionStorage during render, which does not exist in a server render, in a
 * prerender, or in a browser with site data blocked. Any of those throwing would take down every
 * page in the product, so the read has to survive all three.
 */

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
}));

const { ImpersonationBanner } = await import('./admin/ImpersonationBanner');

describe('ImpersonationBanner', () => {
  it('renders nothing when sessionStorage does not exist at all', () => {
    // The prerender and any server render. Touching a missing global must not throw.
    vi.stubGlobal('sessionStorage', undefined);
    expect(renderToString(createElement(ImpersonationBanner))).toBe('');
    vi.unstubAllGlobals();
  });

  it('renders nothing when sessionStorage throws, as it does with site data blocked', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(renderToString(createElement(ImpersonationBanner))).toBe('');
    vi.unstubAllGlobals();
  });

  it('renders nothing for an ordinary signed-in user', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => null });
    expect(renderToString(createElement(ImpersonationBanner))).toBe('');
    vi.unstubAllGlobals();
  });

  it('ignores a malformed entry rather than throwing on it', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'not json' });
    expect(renderToString(createElement(ImpersonationBanner))).toBe('');

    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ label: 42 }) });
    expect(renderToString(createElement(ImpersonationBanner))).toBe('');
    vi.unstubAllGlobals();
  });

  it('names the account when a session is live', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => JSON.stringify({ label: '@chelo618', uid: 'u1', at: Date.now() }),
    });

    const html = renderToString(createElement(ImpersonationBanner));

    expect(html).toContain('@chelo618');
    // The way out has to be in the banner itself; a session you cannot end is the whole risk.
    expect(html).toContain('End session');
    vi.unstubAllGlobals();
  });
});
