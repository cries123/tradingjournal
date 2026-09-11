import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkError';

describe('isChunkLoadError', () => {
  it('recognises how each browser words a chunk it could not load', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: /assets/x.js')).toBe(true);
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true);
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true);
    expect(isChunkLoadError('Loading chunk 42 failed.')).toBe(true);
  });

  /*
   * The half that was missing, and the reason an iPhone user got a crash screen twice on /pricing.
   * Netlify answers a request for an evicted chunk with index.html, so the browser reports a MIME
   * type rather than a missing file.
   */
  it('recognises a chunk that came back as index.html', () => {
    expect(isChunkLoadError("'text/html' is not a valid JavaScript MIME type.")).toBe(true);
    expect(
      isChunkLoadError(
        'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
      ),
    ).toBe(true);
    expect(isChunkLoadError('Unable to preload CSS for /assets/index.css')).toBe(true);
  });

  it('leaves a real crash alone', () => {
    // The cost of a false positive is a reload loop on a genuinely broken build, so this matters
    // more than the misses above.
    expect(isChunkLoadError("Cannot read properties of undefined (reading 'pnl')")).toBe(false);
    expect(isChunkLoadError('Missing or insufficient permissions.')).toBe(false);
    expect(isChunkLoadError('')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
