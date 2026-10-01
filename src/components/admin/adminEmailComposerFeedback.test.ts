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

  it('keeps its own copy even though the modal banner now follows the reader', () => {
    /*
     * This used to assert the opposite — that the banner was far BELOW the composer, with a note
     * saying that if the two ever ended up near each other the inline copy could be dropped.
     *
     * They have: the banner moved into a sticky header, so every section's result is visible from
     * wherever the reader is, which is what Plan and Usage needed. The composer's own copy stays
     * anyway. It sits next to the button that was pressed, which is still the better place to answer
     * "did that send?", and the two do not conflict — one is a receipt, the other a status line.
     */
    expect(MODAL).toContain('<AdminUserEmailComposer');
    expect(MODAL).not.toMatch(/\{message && <p/);
    expect(COMPOSER).toMatch(/\{sent && /);
  });

  it('has the modal reporting results where they can be seen from any section', () => {
    // The fix that made the note above obsolete: sticky, opaque, and carrying both states.
    // To the first section heading after it, so the window is the header block rather than a
    // character count that drifts the moment a class name changes.
    const from = MODAL.indexOf('className="sticky ');
    const header = MODAL.slice(from, MODAL.indexOf('<dl', from));

    expect(header).toContain('bg-bg-card');
    expect(header).toMatch(/\{error \?\? message\}/);
  });

  it('offsets that header by exactly the padding of the box it scrolls inside', () => {
    /*
     * These two numbers have to stay equal. Chromium pins a sticky child at top:0 to the scroll
     * container's CONTENT box — 24px below where the header's own -mt-6 places it — while the
     * elements after it are laid out from the static position. At top-0 the header therefore sat
     * 24px lower than the layout thought and covered the first row of the identity grid.
     */
    const scroller = MODAL.match(/className="panel-card [^"]*"/)?.[0] ?? '';

    expect(scroller).toContain('p-6');
    expect(MODAL).toContain('sticky -top-6');
    expect(MODAL).toContain('-mt-6');
  });
});
