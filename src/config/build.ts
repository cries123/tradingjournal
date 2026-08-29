/**
 * Identity of the running bundle, injected by Vite at build time (see vite.config.ts).
 *
 * Exists so "is the deployed site actually running my latest build?" is answerable by looking at
 * the page rather than by guessing. Surfaced in the admin panel header.
 */

declare const __BUILD_TIME__: string;
declare const __BUILD_SHA__: string;

// `typeof x !== 'undefined'` rather than a try/catch: these are compile-time replacements, so in
// any context where Vite didn't substitute them (a bare tsc run, a test) the identifier simply
// isn't declared and touching it directly would throw a ReferenceError.
export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

export const BUILD_SHA: string =
  typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';

/** e.g. "Aug 29, 06:24 UTC · a1b2c3d" */
export function formatBuildStamp(): string {
  const when = new Date(BUILD_TIME);
  if (Number.isNaN(when.getTime())) return BUILD_SHA;

  const date = when.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const time = when.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });

  return `${date}, ${time} UTC · ${BUILD_SHA}`;
}
