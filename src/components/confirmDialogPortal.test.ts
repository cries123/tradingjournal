import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/*
 * Confirmations must escape their ancestors.
 *
 * position:fixed is relative to the viewport only until an ancestor has a filter, a transform or
 * a backdrop-filter — any of those makes that ancestor the containing block instead. .glass-card
 * has backdrop-filter: blur(12px), so every ConfirmDialog opened from inside one was positioned
 * against a panel that is max-h-[85vh] and overflow-y-auto.
 *
 * On a desktop the panel was big enough that the dialog still landed somewhere visible. On a phone
 * with the panel scrolled, it opened outside the visible area and the button looked dead — which
 * is how it was reported: "clicking the sign-in button doesn't work on mobile". It was not the
 * button. It was every confirmation in that modal, including delete-user and suspend.
 *
 * Source-scanned rather than rendered because the failure is a CSS containing block, which jsdom
 * does not model and a render test would therefore pass straight through.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('ConfirmDialog', () => {
  const source = read('src/components/ConfirmDialog.tsx');

  it('renders through a portal, so an ancestor cannot become its containing block', () => {
    expect(source).toContain('createPortal');
    expect(source).toMatch(/createPortal\(\s*dialog,\s*document\.body\s*\)/);
  });

  it('still renders inline when there is no document', () => {
    // renderToString cannot render a portal, and several first-paint tests render surfaces that
    // contain one. Losing this branch turns those into failures with an unrelated-looking message.
    expect(source).toMatch(/typeof document === 'undefined'/);
  });
});

describe('the class that caused it', () => {
  it('still has the backdrop-filter this works around', () => {
    /*
     * If glass-card ever loses its backdrop-filter, the portal is no longer load-bearing and this
     * comment trail stops making sense — better to be told than to leave the next person reading
     * an explanation of a problem that no longer exists.
     */
    const css = read('src/index.css');
    const block = css.slice(css.indexOf('.glass-card {'));
    expect(block.slice(0, block.indexOf('}'))).toContain('backdrop-filter');
  });
});
