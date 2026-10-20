import type {
  AudienceCounts,
  BroadcastAudience,
  BroadcastKind,
  BroadcastReadiness,
  BroadcastRecord,
} from '../../server/broadcast';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

export type { AudienceCounts, BroadcastAudience, BroadcastKind, BroadcastReadiness, BroadcastRecord };

/** What the Email tab sends: the server checks every field again. */
export interface BroadcastForm {
  kind: BroadcastKind;
  audience: BroadcastAudience;
  subject: string;
  heading: string;
  body: string;
  preheader: string;
  ctaLabel: string;
  ctaUrl: string;
  noticeConfirmed: boolean;
}

export interface BroadcastStatus {
  readiness: BroadcastReadiness;
  problems: Record<BroadcastKind, string | null>;
  broadcasts: BroadcastRecord[];
}

async function broadcastPost<T>(body: Record<string, unknown>): Promise<T> {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in required');

  const res = await fetch('/api/admin-broadcast', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const fetchBroadcastStatus = () => broadcastPost<BroadcastStatus>({ action: 'status' });

export const countAudience = (audience: BroadcastAudience, kind: BroadcastKind) =>
  broadcastPost<{ counts: AudienceCounts }>({ action: 'count', audience, kind }).then((r) => r.counts);

export const previewBroadcast = (form: BroadcastForm) =>
  broadcastPost<{ subject: string; html: string; text: string }>({ action: 'preview', ...form });

export const sendBroadcastTest = (form: BroadcastForm) =>
  broadcastPost<{ message: string }>({ action: 'test', ...form }).then((r) => r.message);

export const createBroadcast = (form: BroadcastForm) =>
  broadcastPost<{ broadcast: BroadcastRecord }>({ action: 'create', ...form }).then((r) => r.broadcast);

export const sendBroadcastChunks = (id: string) =>
  broadcastPost<{ broadcast: BroadcastRecord; waiting: boolean }>({ action: 'send', id });
