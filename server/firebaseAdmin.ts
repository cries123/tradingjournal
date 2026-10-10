import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/*
 * The modular entry points, not `import admin from 'firebase-admin'`.
 *
 * firebase-admin 14 removes the legacy namespace API (admin.initializeApp, admin.firestore(),
 * admin.firestore.FieldValue …), and 14 is where the fix for the SDK's remaining dependency
 * advisories lives. The modular API exists in 13 as well, so this file works on the version installed
 * today and the upgrade becomes a version bump rather than a migration. See RECOVERY.md for the
 * other half of that upgrade: 14 needs Node 22 on Netlify.
 */

export function getFirebaseAdmin(): App {
  // One app per warm instance. getApps() is the SDK's own registry, so a second call — or a second
  // module that initialised first — returns the existing app instead of throwing "already exists".
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error('User management API is not configured');
  }

  const serviceAccount = JSON.parse(raw) as ServiceAccount;
  return initializeApp({ credential: cert(serviceAccount) });
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdmin());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getFirebaseAdmin());
}
