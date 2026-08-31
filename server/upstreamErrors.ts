/**
 * Whether a failed pull means the user paid for an outage rather than for a call.
 *
 * The charge is taken before the pull on purpose — counting afterwards lets a retry loop pull for
 * free. The cost of that ordering is that when SnapTrade is unreachable, the user is billed a sync
 * for a request that never reached anyone, and the app has no way to notice it should not have
 * been. During the outage this was written for, three of a Diamond user's three daily syncs went
 * that way in a row, each one reported as a plain error while the meter still read "3 left".
 *
 * Refunds are limited to failures that clearly are not about this user's data: no response at all,
 * a timeout, or an upstream 5xx. A 4xx is SnapTrade answering — the call happened, the quota it was
 * capped for was spent, and refunding those is what turns the cap into a suggestion.
 */
export function isUpstreamOutage(err: unknown): boolean {
  const status = (err as { status?: number; response?: { status?: number } } | null)?.response
    ?.status ?? (err as { status?: number } | null)?.status;
  if (typeof status === 'number') return status >= 500;

  // No status at all: the request never got an answer. Fetch and undici surface this as a
  // TypeError or an AggregateError with a cause code rather than anything HTTP-shaped.
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.cause?.code
    ?? (err as { code?: string } | null)?.code;
  if (typeof code === 'string') {
    return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code);
  }

  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('socket hang up')
  );
}
