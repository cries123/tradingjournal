import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Pressing Send has to say something, next to the button.
 *
 * It did not. The composer reported its result only through onDone/onError to the parent, and the
 * parent renders that banner at the very bottom of the Account section — past the password reset,
 * the change-email box, the set-password box and the delete button. The composer is the FIRST
 * control in that section, so on a phone the answer landed several screens below the question and
 * Send looked like a dead button. It closed itself on success too, so the working case was just as
 * silent as the broken one.
 *
 * Both failures this was hiding are configuration, and both have specific messages worth reading:
 * a missing FIREBASE_SERVICE_ACCOUNT_JSON makes every admin action 503, and a missing
 * RESEND_API_KEY makes this one 503. Neither was reaching the person pressing the button.
 *
 * Source assertions rather than a click test: the suite runs in node with no DOM, and what broke
 * is where output is rendered rather than what any function returns.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

const COMPOSER = read('src/components/admin/AdminUserEmailComposer.tsx');
const MODAL = read('src/components/admin/AdminUserDetailModal.tsx');

describe('admin email composer feedback', () => {
  it('renders its own result rather than only reporting upward', () => {
    expect(COMPOSER).toMatch(/\{failed && /);
    expect(COMPOSER).toMatch(/\{sent && /);
  });

  it('still tells the parent, so the audit trail and shared banner keep working', () => {
    expect(COMPOSER).toContain('onDone(message)');
    expect(COMPOSER).toContain("onAudit('user.emailed'");
    expect(COMPOSER).toMatch(/onError\(/);
  });

  it('does not close itself the moment a send succeeds', () => {
    // setOpen(false) on success is what made a working send indistinguishable from a dead button.
    // Closing is now the reader's choice, after they have seen the confirmation.
    const sendFn = COMPOSER.slice(COMPOSER.indexOf('const send = async'), COMPOSER.indexOf('if (!open)'));
    expect(sendFn).not.toContain('setOpen(false)');
  });

  it('is still far above the modal banner it used to depend on', () => {
    // Not a rule, a reason: if these ever end up near each other the inline copy above could be
    // dropped. While this gap exists, it cannot be.
    const composerAt = MODAL.indexOf('<AdminUserEmailComposer');
    const bannerAt = MODAL.indexOf('{message && <p');
    expect(composerAt).toBeGreaterThan(-1);
    expect(bannerAt).toBeGreaterThan(composerAt);
  });
});
