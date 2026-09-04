/**
 * Working out whether two email addresses are the same mailbox.
 *
 * Only ever used to decide whether an account has already had something free — never to merge
 * accounts, never to look anybody up. The addresses themselves are not stored anywhere this
 * reaches; the caller hashes the result first.
 *
 * The rules are deliberately the boring, well-known ones rather than anything clever. Being
 * wrong in the strict direction refuses a real customer their trial, which is far more expensive
 * than letting one determined person through.
 */

/** Providers that ignore dots in the local part. Gmail is the only one that really matters. */
const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com']);

/**
 * Domains that are the same mailbox under different names, so an alias cannot pass as new.
 * Only aliases the provider itself publishes — guessing at this is how you refuse real people.
 */
const DOMAIN_ALIASES: Record<string, string> = {
  'googlemail.com': 'gmail.com',
  'hotmail.co.uk': 'outlook.com',
  'live.com': 'outlook.com',
  'hotmail.com': 'outlook.com',
  'msn.com': 'outlook.com',
  'pm.me': 'proton.me',
  'protonmail.com': 'proton.me',
  'protonmail.ch': 'proton.me',
};

/**
 * The mailbox an address actually reaches, lowercased.
 *
 * Everything after a `+` goes: plus-addressing is supported by Gmail, Outlook, iCloud, Proton and
 * Fastmail, and "jay+1@, jay+2@, jay+3@" is the entire technique behind most trial farming. Dots
 * go for Gmail only, because they are significant everywhere else and stripping them generally
 * would collide two different people at the same company.
 *
 * Returns null for anything that isn't a usable address, so a caller can't accidentally key a
 * record on an empty string.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;

  const plus = local.indexOf('+');
  if (plus === 0) return null; // "+tag@example.com" addresses no mailbox at all
  if (plus > 0) local = local.slice(0, plus);

  if (DOT_INSENSITIVE.has(domain)) local = local.replaceAll('.', '');

  domain = DOMAIN_ALIASES[domain] ?? domain;
  if (!local) return null;

  return `${local}@${domain}`;
}

/** True when both addresses reach the same mailbox. Two unusable addresses are never "the same". */
export function sameMailbox(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return left !== null && left === right;
}
