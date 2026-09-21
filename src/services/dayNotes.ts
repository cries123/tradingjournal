import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export interface DayNote {
  date: string;
  note: string;
  /** 1–5 self-rated discipline for the session. */
  discipline?: number;
  updatedAt: string;
}

const LOCAL_KEY = 'trend-chasers-day-notes:local';

function loadLocalNotes(): Record<string, DayNote> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DayNote>) : {};
  } catch {
    return {};
  }
}

function saveLocalNotes(notes: Record<string, DayNote>): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(notes));
  } catch {
    // quota / private mode — note stays in memory for the session
  }
}

/**
 * Every day note at once, for searching.
 *
 * The rest of this file reads one note per day, which is right for a calendar — but search cannot
 * ask "which day mentions ES" one document at a time. One subcollection read, on demand when the
 * search panel first opens rather than on app start, so a trader who never searches never pays for
 * it. Signed out, the local store already holds them all.
 */
export async function fetchAllDayNotes(uid: string | null): Promise<DayNote[]> {
  if (uid && isFirebaseConfigured()) {
    const snap = await getDocs(collection(getFirebaseDb(), 'users', uid, 'dayNotes'));
    return snap.docs.map((d) => ({ ...(d.data() as DayNote), date: d.id }));
  }
  return Object.values(loadLocalNotes());
}

export async function fetchDayNote(uid: string | null, date: string): Promise<DayNote | null> {
  if (uid && isFirebaseConfigured()) {
    const snap = await getDoc(doc(getFirebaseDb(), 'users', uid, 'dayNotes', date));
    return snap.exists() ? (snap.data() as DayNote) : null;
  }
  return loadLocalNotes()[date] ?? null;
}

export async function saveDayNote(
  uid: string | null,
  date: string,
  note: string,
  discipline?: number,
): Promise<void> {
  const trimmed = note.trim();

  if (uid && isFirebaseConfigured()) {
    const ref = doc(getFirebaseDb(), 'users', uid, 'dayNotes', date);
    if (!trimmed && discipline == null) {
      await deleteDoc(ref);
      return;
    }
    await setDoc(ref, {
      date,
      note: trimmed,
      ...(discipline != null ? { discipline } : {}),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const notes = loadLocalNotes();
  if (!trimmed && discipline == null) {
    delete notes[date];
  } else {
    notes[date] = {
      date,
      note: trimmed,
      ...(discipline != null ? { discipline } : {}),
      updatedAt: new Date().toISOString(),
    };
  }
  saveLocalNotes(notes);
}
