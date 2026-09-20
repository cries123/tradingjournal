import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Form fields have to be able to shrink inside a grid.
 *
 * Both halves of this are one CSS declaration and both are invisible until somebody opens the app
 * on a phone. A grid item's min-width defaults to `auto` — "no narrower than my content" — and
 * date and time inputs carry a large intrinsic width from the UA stylesheet, iOS Safari's most of
 * all, because it reserves room for the picker. The column then grows to fit the input instead of
 * the input shrinking to fit the column, and the Entry/Exit time row pushes through the right edge
 * of the trade modal.
 *
 * Asserted on the source rather than a render because there is no browser here, and because the
 * one that is available cannot reproduce it: Chrome's time input is narrow enough to fit either
 * way, so a render test would pass on a build that is broken on the device the bug was reported
 * from. What can be pinned is that the two declarations are still there.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

describe('form fields shrink inside their column', () => {
  it('lets the input itself shrink', () => {
    const css = read('src/index.css');
    const rule = css.slice(css.indexOf('.input-field {'), css.indexOf('.input-field:focus'));

    expect(rule).toContain('width: 100%');
    // width:100% alone is not enough, which is the entire reason this test exists.
    expect(rule).toContain('min-width: 0');
  });

  it('lets the wrapper that is the grid item shrink too', () => {
    // Field wraps every input in the trade modal, including through NumericField, so this one
    // class covers every row in there.
    const modal = read('src/components/TradeModal.tsx');
    const field = modal.slice(modal.indexOf('function Field('), modal.indexOf('function NumericField('));

    expect(field).toMatch(/<label className="block min-w-0"/);
  });
});
