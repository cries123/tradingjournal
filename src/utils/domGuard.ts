/**
 * Surviving somebody else rearranging the DOM underneath React.
 *
 * The symptom is always the same line:
 *
 *   NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node
 *   is to be inserted is not a child of this node.
 *
 * React keeps direct references to the DOM nodes it created, and inserts new siblings relative to
 * them. Anything that moves one of those nodes without telling React — Chrome's translate feature
 * wrapping text in <font> tags is far and away the most common, but Grammarly, password managers,
 * dark-mode extensions and reader modes all do it — leaves React holding a reference to a node
 * that is no longer a child of the parent it is inserting into. The next conditional re-render
 * throws, the error boundary catches it, and the person loses the page they were on.
 *
 * There is nothing to fix in the app: no code here touches the DOM below <body>. The realistic
 * options are to forbid translation outright, which is hostile to anyone who needs it, or to make
 * the two operations tolerant of a node that has been moved. This does the second.
 *
 * Both wrappers delegate untouched in the normal case. They only differ where the DOM call would
 * have thrown, and in that case they do the closest sane thing rather than taking the page down.
 */

/**
 * Whether inserting here would throw, so the node should just be appended instead.
 *
 * A null reference already means "append" to insertBefore, so it is not a mismatch. Everything
 * else is only a problem when the reference has been moved out of this parent.
 */
export function referenceIsMisplaced(parent: Node, reference: Node | null): boolean {
  return reference !== null && reference.parentNode !== parent;
}

/** Whether removing this child would throw because something already moved it elsewhere. */
export function childIsAlreadyGone(parent: Node, child: Node): boolean {
  return child.parentNode !== parent;
}

let installed = false;

/**
 * Installs the tolerance. Safe to call more than once; only the first does anything.
 *
 * `onRecovered` fires the first time either wrapper has to step in, so the fact that this is
 * happening at all is visible rather than silently absorbed — a page that quietly repairs itself
 * forever is how you never learn that a whole class of user is translating your app.
 */
export function installDomGuard(onRecovered?: (operation: 'insertBefore' | 'removeChild') => void): void {
  if (installed || typeof Node === 'undefined' || !Node.prototype) return;
  installed = true;

  let reported = false;
  const report = (operation: 'insertBefore' | 'removeChild') => {
    if (reported) return;
    reported = true;
    try {
      onRecovered?.(operation);
    } catch {
      // Reporting a recovery must never itself break the render it just rescued.
    }
  };

  const nativeInsertBefore = Node.prototype.insertBefore;
  const nativeRemoveChild = Node.prototype.removeChild;

  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    newNode: T,
    reference: Node | null,
  ): T {
    if (referenceIsMisplaced(this, reference)) {
      report('insertBefore');
      // Appending puts the node in the right parent but possibly the wrong position. React
      // corrects the order on its next commit, and a briefly misordered element is a far better
      // outcome than a thrown error that unmounts the page.
      return nativeInsertBefore.call(this, newNode, null) as T;
    }
    return nativeInsertBefore.call(this, newNode, reference) as T;
  };

  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (childIsAlreadyGone(this, child)) {
      report('removeChild');
      // Whatever moved it has taken ownership. React wanted it gone; it is gone from here.
      return child;
    }
    return nativeRemoveChild.call(this, child) as T;
  };
}
