import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export type BrokerSupportStatus = 'open' | 'resolved' | 'closed';

export interface BrokerSupportRequest {
  id: string;
  brokerName: string;
  exportMethod: string;
  details: string;
  email: string;
  uid: string | null;
  username: string | null;
  status: BrokerSupportStatus;
  createdAt: string;
  userAgent: string;
  pageUrl: string;
  adminNote?: string;
}

export interface SubmitBrokerSupportInput {
  brokerName: string;
  exportMethod: string;
  details?: string;
  email: string;
  uid?: string | null;
  username?: string | null;
}

export async function submitBrokerSupportRequest(input: SubmitBrokerSupportInput): Promise<string> {
  if (!isFirebaseConfigured()) {
    throw new Error('Broker support requests are unavailable right now. Please try again later.');
  }

  const payload = {
    brokerName: input.brokerName.trim(),
    exportMethod: input.exportMethod.trim(),
    details: (input.details ?? '').trim(),
    email: input.email.trim(),
    uid: input.uid ?? null,
    username: input.username ?? null,
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
  };

  const ref = await addDoc(collection(getFirebaseDb(), 'brokerSupportRequests'), payload);
  return ref.id;
}

export async function fetchBrokerSupportRequests(): Promise<BrokerSupportRequest[]> {
  if (!isFirebaseConfigured()) return [];

  const q = query(collection(getFirebaseDb(), 'brokerSupportRequests'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<BrokerSupportRequest, 'id'>),
  }));
}

export async function updateBrokerSupportStatus(
  requestId: string,
  status: BrokerSupportStatus,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), 'brokerSupportRequests', requestId), { status });
}

export async function updateBrokerSupportAdminNote(
  requestId: string,
  adminNote: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), 'brokerSupportRequests', requestId), {
    adminNote: adminNote.trim(),
  });
}
