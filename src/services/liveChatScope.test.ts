import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Where the live chat widget is allowed to run.
 *
 * Tawk is third-party JavaScript in the same document as the page it loads on, and its own feature
 * list includes screen sharing. On /app and /admin that document contains broker connections,
 * account balances and realised P&L. The widget's value is answering a question from somebody who
 * has not signed up yet, and those people are never on either screen — signed-in users have
 * support tickets, which reply by email and keep the thread.
 *
 * So the exclusion is the whole point of the hook rather than a detail of it, and it is the kind
 * of line that gets deleted by somebody wiring the widget up somewhere new.
 */

const HOOK = readFileSync(join(process.cwd(), 'src/hooks/useLiveChat.ts'), 'utf-8');
const APP = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf-8');

describe('live chat scope', () => {
  it('keeps the widget off the journal and the admin panel', () => {
    const list = HOOK.slice(HOOK.indexOf('PRIVATE_ROUTES'), HOOK.indexOf('interface TawkApi'));
    expect(list).toContain("'app'");
    expect(list).toContain("'admin'");
  });

  it('never injects the script on those routes', () => {
    // Hiding after loading would still have fetched and run it on a page showing someone's P&L.
    expect(HOOK).toMatch(/if \(isPrivate \|\| document\.getElementById\('tawk-embed'\)\) return;/);
  });

  it('hides it when a client-side navigation lands on one', () => {
    // Arriving at /app directly never injects it, but walking there from the landing page with the
    // widget already loaded would otherwise carry it across.
    expect(HOOK).toContain('hideWidget');
  });

  it('only opens a real chat on the live domain', () => {
    // A preview deploy or a fork putting somebody through to the inbox is worse than no widget:
    // at the Tawk end it is indistinguishable from a customer on the live site.
    expect(HOOK).toContain('LIVE_HOSTS');
    expect(HOOK).toContain("'trendchasers.net'");
    expect(HOOK).toMatch(/if \(!src\) return;/);
  });

  it('can still be pointed somewhere else for testing', () => {
    expect(HOOK).toContain('VITE_TAWK_SRC');
  });

  it('is actually wired into the app', () => {
    expect(APP).toContain('useLiveChat(route)');
  });
});
