import { describe, expect, it } from 'vitest';
import { childIsAlreadyGone, referenceIsMisplaced } from './domGuard';

/*
 * The decision the two wrappers make, tested without a DOM.
 *
 * Only the predicates live here — the wrappers themselves are three lines of delegation each, and
 * everything that could be wrong about them is in deciding when NOT to delegate. Getting that
 * wrong in the permissive direction silently reorders the page on every render; getting it wrong
 * in the strict direction leaves the crash exactly as it was.
 */

const node = (parent: unknown = null) => ({ parentNode: parent }) as unknown as Node;

describe('when insertBefore would throw', () => {
  it('does not interfere with an ordinary insert', () => {
    const parent = node();
    expect(referenceIsMisplaced(parent, node(parent))).toBe(false);
  });

  it('treats a null reference as an append, not a mismatch', () => {
    // insertBefore(x, null) is already "append" and never throws. Diverting it would mean the
    // wrapper stepping in on completely healthy renders.
    expect(referenceIsMisplaced(node(), null)).toBe(false);
  });

  it('steps in when the reference has been moved somewhere else', () => {
    // Exactly what Chrome's translate does: the text node React is holding gets wrapped in a
    // <font>, so its parent is now that font element rather than the one React is inserting into.
    const parent = node();
    const somewhereElse = node();
    expect(referenceIsMisplaced(parent, node(somewhereElse))).toBe(true);
  });

  it('steps in when the reference has been detached entirely', () => {
    expect(referenceIsMisplaced(node(), node(null))).toBe(true);
  });
});

describe('when removeChild would throw', () => {
  it('does not interfere with removing a real child', () => {
    const parent = node();
    expect(childIsAlreadyGone(parent, node(parent))).toBe(false);
  });

  it('steps in when something else already took the node', () => {
    const parent = node();
    expect(childIsAlreadyGone(parent, node(node()))).toBe(true);
    expect(childIsAlreadyGone(parent, node(null))).toBe(true);
  });
});
