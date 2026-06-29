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

export type BugReportStatus = 'open' | 'resolved' | 'closed';

export interface BugReport {
  id: string;
  description: string;
  steps: string;
  email: string;
  uid: string | null;
  username: string | null;
  status: BugReportStatus;
  createdAt: string;
  userAgent: string;
  pageUrl: string;
  adminNote?: string;
}

export interface SubmitBugReportInput {
  description: string;
  steps?: string;
  email: string;
  uid?: string | null;
  username?: string | null;
}

export async function submitBugReport(input: SubmitBugReportInput): Promise<string> {
  if (!isFirebaseConfigured()) {
    throw new Error('Bug reporting is unavailable right now. Please email support instead.');
  }

  const payload = {
    description: input.description.trim(),
    steps: (input.steps ?? '').trim(),
    email: input.email.trim(),
    uid: input.uid ?? null,
    username: input.username ?? null,
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
  };

  const ref = await addDoc(collection(getFirebaseDb(), 'bugReports'), payload);
  return ref.id;
}

export async function fetchBugReports(): Promise<BugReport[]> {
  if (!isFirebaseConfigured()) return [];

  const q = query(collection(getFirebaseDb(), 'bugReports'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<BugReport, 'id'>),
  }));
}

export async function updateBugReportStatus(
  reportId: string,
  status: BugReportStatus,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), 'bugReports', reportId), { status });
}

export async function updateBugReportAdminNote(reportId: string, adminNote: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(getFirebaseDb(), 'bugReports', reportId), { adminNote: adminNote.trim() });
}
