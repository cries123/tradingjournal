import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface AdminUserNote {
  note: string;
  flagged: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const EMPTY_NOTE: AdminUserNote = { note: '', flagged: false, updatedAt: null, updatedBy: null };

/** Internal, admin-only notes/flags keyed by uid — kept out of the user's own document. */
export async function fetchAdminUserNote(uid: string): Promise<AdminUserNote> {
  if (!isFirebaseConfigured()) return EMPTY_NOTE;
  const snap = await getDoc(doc(getFirebaseDb(), 'adminUserNotes', uid));
  if (!snap.exists()) return EMPTY_NOTE;
  const data = snap.data() as Partial<AdminUserNote>;
  return {
    note: data.note ?? '',
    flagged: Boolean(data.flagged),
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

/** Bulk-loads every stored admin note, keyed by uid, for merging into the user list in one read. */
export async function fetchAllAdminUserNotes(): Promise<Map<string, AdminUserNote>> {
  const map = new Map<string, AdminUserNote>();
  if (!isFirebaseConfigured()) return map;
  const snap = await getDocs(collection(getFirebaseDb(), 'adminUserNotes'));
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Partial<AdminUserNote>;
    map.set(docSnap.id, {
      note: data.note ?? '',
      flagged: Boolean(data.flagged),
      updatedAt: data.updatedAt ?? null,
      updatedBy: data.updatedBy ?? null,
    });
  }
  return map;
}

export async function saveAdminUserNote(
  uid: string,
  patch: { note?: string; flagged?: boolean },
  adminEmail: string,
): Promise<AdminUserNote> {
  if (!isFirebaseConfigured()) return EMPTY_NOTE;
  const existing = await fetchAdminUserNote(uid);
  const next: AdminUserNote = {
    note: (patch.note ?? existing.note).trim(),
    flagged: patch.flagged ?? existing.flagged,
    updatedAt: new Date().toISOString(),
    updatedBy: adminEmail,
  };
  await setDoc(doc(getFirebaseDb(), 'adminUserNotes', uid), next);
  return next;
}
