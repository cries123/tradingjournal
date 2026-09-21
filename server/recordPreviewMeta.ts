import type { PublishedRecord } from '../src/utils/trackRecord';

/**
 * Building the link-preview card for a published record.
 *
 * Split out of the Netlify handler because it is string surgery on HTML, which is the kind of code
 * that half-works in a way nobody notices — a tag appended instead of replaced still renders, and
 * the crawler quietly picks whichever of the two duplicates it likes. Here it can be tested.
 */

export const SITE_ORIGIN = 'https://trendchasers.net';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The card's wording.
 *
 * "Verified", never "audited". Nobody audits these trades, and an audited track record is a
 * specific, regulated claim in performance advertising — the first thing a sceptic tests and the
 * one word that makes the whole page collapse when it fails. The accurate claim is also the
 * stronger one: a figure that the person it flatters has no way to edit.
 *
 * For the same reason it does not say the record cannot be manipulated. The trader chooses which
 * brokerage accounts to connect and which journals to include; what they cannot do is change a
 * number once those choices are made, and that is what this says.
 */
/*
 * Takes no slug on purpose.
 *
 * The obvious fallback for an anonymous record would be to name it by its slug — but the slug
 * IS the username, so that would undo the one thing "publish without my name" does, on the
 * card that gets pasted into group chats.
 */
export function describeRecord(record: PublishedRecord): { title: string; description: string } {
  const who = record.username ?? 'A trader';
  const excluded =
    record.excludedTrades > 0
      ? ` ${record.excludedTrades.toLocaleString()} hand-entered ${
          record.excludedTrades === 1 ? 'trade' : 'trades'
        } excluded.`
      : '';

  return {
    title: record.username
      ? `${who}'s broker-verified trading record — Trend Chasers`
      : 'A broker-verified trading record — Trend Chasers',
    description:
      `${record.verifiedTrades.toLocaleString()} trades imported straight from a connected ` +
      `brokerage over ${record.tradingDays.toLocaleString()} trading days.${excluded} ` +
      `Stamped by Trend Chasers — the trader cannot edit these figures.`,
  };
}

/**
 * Replaces the shell's own tags rather than appending.
 *
 * Appending would leave two og:title tags in the document and let each crawler pick a different
 * one, so a record could preview correctly on one platform and as the homepage on the next. A tag
 * the shell does not have is added before </head>.
 */
export function injectMeta(html: string, tags: Record<string, string>, url: string): string {
  let out = html;

  for (const [key, value] of Object.entries(tags)) {
    const attr = key.startsWith('og:') ? 'property' : 'name';
    const escaped = escapeHtml(value);
    const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`, 'i');
    const replacement = `<meta ${attr}="${key}" content="${escaped}" />`;
    out = pattern.test(out)
      ? out.replace(pattern, replacement)
      : out.replace('</head>', `    ${replacement}
  </head>`);
  }

  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
  );
  /*
   * Canonical, for the same reason as og:url.
   *
   * The shell's canonical points at the homepage. Served unchanged on every record, each published
   * page would declare itself a duplicate of "/" and drop out of search entirely — the opposite of
   * what a page that exists to be found should do.
   */
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  );

  return out;
}

/** The tags for a record that exists. */
export function tagsForRecord(record: PublishedRecord): Record<string, string> {
  const { title, description } = describeRecord(record);
  return {
    'og:title': title,
    'og:description': description,
    'og:type': 'profile',
    'twitter:title': title,
    'twitter:description': description,
    'twitter:card': 'summary_large_image',
  };
}

/** The tags for a slug nobody has published, or has taken down. */
export function tagsForMissingRecord(): Record<string, string> {
  return {
    'og:title': 'No record here — Trend Chasers',
    'og:description': 'Nobody has published a verified trading record at this address.',
    'twitter:title': 'No record here — Trend Chasers',
    'twitter:description': 'Nobody has published a verified trading record at this address.',
  };
}
