import type { Handler, HandlerResponse } from '@netlify/functions';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import {
  injectMeta,
  SITE_ORIGIN,
  tagsForMissingRecord,
  tagsForRecord,
} from '../../server/recordPreviewMeta';
import type { PublishedRecord } from '../../src/utils/trackRecord';

/**
 * Serves /r/<slug> with its Open Graph tags already in the HTML.
 *
 * Every link-preview crawler there is — iMessage, Discord, Slack, X, Facebook, WhatsApp — fetches
 * the page and reads the markup. None of them run JavaScript. So usePageMeta, which sets these
 * tags after React mounts, is invisible to all of them: without this, a pasted record link
 * previews as the generic Trend Chasers homepage card, which is the opposite of the point.
 *
 * Prerendering cannot cover it either — scripts/prerender.mjs walks a fixed route list at build
 * time, and these pages are created by users afterwards.
 *
 * The same HTML goes to people and to crawlers. No user-agent sniffing: serving a bot different
 * markup from a human is cloaking, and it also guarantees the thing being shared is never the
 * thing that was tested.
 */

/** Cached across warm invocations — the shell only changes on deploy. */
let shellHtml: string | null = null;

async function loadShell(): Promise<string> {
  if (shellHtml) return shellHtml;
  // process.env.URL is this deploy's own address, so this reads the shell that was just published
  // rather than whatever happens to be live on the production domain.
  const res = await fetch(`${process.env.URL ?? SITE_ORIGIN}/index.html`);
  if (!res.ok) throw new Error(`shell fetch failed: ${res.status}`);
  shellHtml = await res.text();
  return shellHtml;
}

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  const slug = (event.path.split('/r/')[1] ?? '').replace(/\/$/, '').toLowerCase();

  let shell: string;
  try {
    shell = await loadShell();
  } catch (err) {
    // With no shell there is no page to serve at all; the homepage is at least somewhere real.
    console.error('[record-preview] could not load the app shell:', err);
    return { statusCode: 302, headers: { Location: '/' }, body: '' };
  }

  if (!slug) return { statusCode: 302, headers: { Location: '/' }, body: '' };

  let record: PublishedRecord | null = null;
  try {
    const snap = await getAdminFirestore().doc(`trackRecords/${slug}`).get();
    if (snap.exists) record = snap.data() as PublishedRecord;
  } catch (err) {
    // A failed read must not take the page down. React fetches the record itself and renders
    // either it or its own "no record here"; only the preview card is lost.
    console.error('[record-preview] could not read the record:', err);
  }

  const url = `${SITE_ORIGIN}/r/${slug}`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      /*
       * Short, and revalidated rather than trusted.
       *
       * A record changes only when its owner republishes, but a stale preview means a figure being
       * quoted at strangers after the trader corrected or withdrew it — so a taken-down page stops
       * previewing within the minute instead of living on in a CDN for a day.
       */
      'Cache-Control': record
        ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=60'
        : 'no-store',
    },
    body: injectMeta(
      shell,
      record ? tagsForRecord(record) : tagsForMissingRecord(),
      url,
    ),
  };
};
