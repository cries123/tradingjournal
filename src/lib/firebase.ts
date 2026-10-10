import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseApp } from './firebaseAuth';

/*
 * The app and sign-in live in firebaseAuth.ts, which the public pages import on their own so they do
 * not pull Firestore into the entry. Re-exported here so everything already importing them from this
 * module — all of it inside lazily-loaded chunks — keeps working unchanged.
 *
 * Do not import this module from anything reachable from src/main.tsx without a dynamic import():
 * this file imports Firestore and Storage statically, and that is the whole point of the split.
 */
export { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from './firebaseAuth';

let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

/**
 * Firestore with an on-disk cache, which is the difference between a journal that costs pennies
 * and one that doesn't.
 *
 * Without this, every app open streams the user's ENTIRE trades collection from the server: a
 * trader with 800 trades bills 800 reads for opening their dashboard, again on every reload, on
 * every device, all day. Multiply by a user base and the free tier's 50k daily reads is gone by
 * lunchtime — which is exactly what happened, and it looked like data loss because Firestore
 * refuses reads once the quota trips, so journals rendered empty and the admin panel locked out.
 *
 * With a persistent cache, the first load pays for the documents once and later loads are served
 * from IndexedDB; the listener then pulls only what actually changed. A journal that gains a few
 * trades a day costs a few reads a day instead of its whole history every time.
 *
 * The multi-tab manager matters because traders keep the journal open in a pinned tab and open a
 * second one — without it the second tab can't share the cache and falls back to server reads.
 */
export function getFirebaseDb(): Firestore {
  if (db) return db;

  const firebaseApp = getFirebaseApp();
  try {
    db = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Private browsing, a browser without IndexedDB, or initializeFirestore already having run.
    // Falling back to the memory-cached default costs reads but must never break the app.
    db = getFirestore(firebaseApp);
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}
