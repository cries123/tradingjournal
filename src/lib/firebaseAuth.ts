import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * The Firebase app and sign-in — nothing that talks to the database.
 *
 * Split out of lib/firebase.ts so the public pages can know who is signed in without downloading
 * Firestore. That one module imported auth, Firestore and Storage together, and because the root
 * auth context imports it, every visitor to the landing page fetched and evaluated all three before
 * the page became interactive — 194 KB compressed, of which Firestore alone was 135 KB.
 *
 * Anything reachable from src/main.tsx without a dynamic import() must import from HERE, never from
 * lib/firebase.ts. lib/firebase.ts re-exports everything below, so code that already lives in a
 * lazily-loaded chunk can keep importing from it unchanged. Firestore on the public pages goes
 * through lib/lazyFirestore.ts.
 */

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
