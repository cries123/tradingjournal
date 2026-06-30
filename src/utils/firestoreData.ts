/** Firestore rejects `undefined` field values — omit them before writes. */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested === undefined) continue;
    out[key] = stripUndefinedDeep(nested);
  }
  return out as T;
}
