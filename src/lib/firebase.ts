import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  if (!app) app = initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

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
