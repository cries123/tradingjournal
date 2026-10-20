import { TIER_PLANS } from '../../config/tiers';
import type { AudienceCounts, BroadcastAudience, BroadcastKind, BroadcastRecord } from '../../services/adminBroadcast';

/**
 * The words the Email tab uses. In a .ts beside the panel because `react-refresh/only-export-components`
 * rejects non-component exports from a .tsx, and these are what the tests read.
 */

export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  all: 'Everyone',
  free: 'Free accounts',
  paid: 'Every paid plan',
  silver: TIER_PLANS.silver.name,
  gold: TIER_PLANS.gold.name,
  diamond: TIER_PLANS.diamond.name,
};

export const KIND_LABELS: Record<BroadcastKind, string> = {
  news: 'News',
  notice: 'Account notice',
};

export const KIND_HELP: Record<BroadcastKind, string> = {
  news: 'A feature, a price, anything somebody could reasonably not want. Has an unsubscribe link, skips people who used it, and carries your postal address.',
  notice: 'Something about their own account they have to be told: a change to the terms, a problem with their data. No unsubscribe link, and it reaches people who unsubscribed from news, so never use it for a promotion.',
};

const n = (value: number) => value.toLocaleString('en-US');
const people = (value: number) => `${n(value)} ${value === 1 ? 'person' : 'people'}`;

/**
 * "Reaches 1,204 people. Left out: 37 unsubscribed from news, 12 with no usable email." Only the
 * reasons that apply, so the line stays short on a small list.
 */
export function audienceSummary(counts: AudienceCounts): string {
  const out = [
    counts.optedOut > 0 && `${n(counts.optedOut)} unsubscribed from news`,
    counts.noEmail > 0 && `${n(counts.noEmail)} with no usable email`,
    counts.disabled > 0 && `${n(counts.disabled)} suspended`,
    counts.duplicates > 0 && `${n(counts.duplicates)} sharing an address with another account`,
  ].filter(Boolean);
  return `Reaches ${people(counts.recipients)}.${out.length ? ` Left out: ${out.join(', ')}.` : ''}`;
}

export function sendButtonLabel(recipients: number | null): string {
  return recipients === null ? 'Send to everyone in this audience' : `Send to ${people(recipients)}`;
}

/** Where one broadcast stands, for its row in the history and the progress line. */
export function progressLabel(b: Pick<BroadcastRecord, 'status' | 'total' | 'sent' | 'failed'>): string {
  const failed = b.failed > 0 ? `, ${n(b.failed)} failed` : '';
  if (b.status === 'done') return `Done: ${n(b.sent)} of ${n(b.total)} sent${failed}`;
  return `Unfinished: ${n(b.sent)} of ${n(b.total)} sent${failed}`;
}
