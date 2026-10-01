/**
 * Saving a JSON file to the trader's machine, in the one sequence that works everywhere.
 *
 * Two copies of this existed — the backup button and the duplicate cleanup — and both got the same
 * two things wrong: the anchor was never put in the document, and the blob URL was revoked on the
 * same tick as the click. Chrome tolerates both. WebKit does not reliably: revoking before the
 * browser has taken the download over cancels it, and a detached anchor has historically been
 * ignored outright.
 *
 * That is a cosmetic bug in one caller and a data-loss bug in the other. The duplicate cleanup
 * deletes trades immediately after calling this, and tells the trader "a copy of every removed row
 * downloads first, so this is reversible" — a promise that could quietly be false on an iPhone,
 * which is the device most of them read the app on.
 *
 * One copy, because this is the chunkError lesson again: two copies of a browser workaround drift,
 * and the one nobody is looking at is the one that breaks.
 */

export interface JsonFile {
  filename: string;
  text: string;
}

/**
 * The half worth testing: what the file is called and what is in it.
 *
 * Date-stamped rather than timestamped because a human has to recognise it in a downloads folder.
 * Two exports on one day collide, and the browser resolves that by suffixing "(1)" — which is the
 * right outcome: both files are kept and the newer one is obvious.
 */
export function buildJsonFile(prefix: string, isoTimestamp: string, data: unknown): JsonFile {
  const day = /^\d{4}-\d{2}-\d{2}/.test(isoTimestamp) ? isoTimestamp.slice(0, 10) : 'export';
  return {
    filename: `${prefix}-${day}.json`,
    // Indented: these files get opened and read by the person who downloaded them, and by me when
    // somebody emails one in to ask what went wrong.
    text: JSON.stringify(data, null, 2),
  };
}

/**
 * Hands the file to the browser.
 *
 * Throws rather than failing quietly, so a caller that is about to delete something can refuse to.
 * It cannot confirm the download finished — no browser API reports that — but it can refuse to
 * pretend in an environment that has no way to save at all.
 */
export function saveJsonFile(file: JsonFile): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new Error('This browser cannot save a file from the page.');
  }

  const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';

  // In the document before the click, out of it after: the tidy-up a detached anchor skips.
  document.body.appendChild(link);
  link.click();
  link.remove();

  /*
   * Revoked on a later task, never on this one.
   *
   * The download is handed over asynchronously, so revoking the URL synchronously after click()
   * races the browser and loses on WebKit. Ten seconds is far longer than that handover needs and
   * still releases the memory; leaving it un-revoked would hold the whole file for the session.
   */
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Build and save in one step, for the callers that have nothing else to do with the file. */
export function downloadJson(prefix: string, isoTimestamp: string, data: unknown): void {
  saveJsonFile(buildJsonFile(prefix, isoTimestamp, data));
}
