const RESERVED = new Set([
  'admin',
  'support',
  'help',
  'mod',
  'moderator',
  'trendchasers',
  'trendchaser',
  'trend',
  'chasers',
  'system',
  'root',
  'null',
  'undefined',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): { ok: true; normalized: string } | { ok: false; error: string } {
  const normalized = normalizeUsername(raw);

  if (normalized.length < 3) {
    return { ok: false, error: 'Username must be at least 3 characters.' };
  }
  if (normalized.length > 20) {
    return { ok: false, error: 'Username must be 20 characters or fewer.' };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return { ok: false, error: 'Use only letters, numbers, and underscores.' };
  }
  if (RESERVED.has(normalized)) {
    return { ok: false, error: 'That username is reserved.' };
  }

  return { ok: true, normalized };
}
