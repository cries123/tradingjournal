/**
 * "This tab is pointing at a deploy that no longer exists."
 *
 * One list, in one file, because two copies of it drifted and that drift was the bug: the reload
 * in ErrorBoundary and the ignore list in errorFingerprint each carried their own version, and
 * neither had learned the phrasing Safari uses — so iPhone users got a crash screen for the one
 * failure that fixes itself, and the feed got a row for it.
 *
 * Two ways a browser describes the same event. Either it could not fetch the chunk at all, or —
 * because Netlify's SPA rewrite answers anything it cannot find with index.html — it fetched a 200
 * carrying HTML where a module should have been, and complained about the MIME type instead.
 */
export const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .* failed|is not a valid JavaScript MIME type|Expected a JavaScript(-or-Wasm)? module script but the server responded with a MIME type|Unable to preload CSS/i;

/** True when this error is a stale chunk rather than a broken app. */
export function isChunkLoadError(subject: string | null | undefined): boolean {
  return CHUNK_LOAD_ERROR_PATTERN.test(subject ?? '');
}
