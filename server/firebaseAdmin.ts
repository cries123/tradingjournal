import admin from 'firebase-admin';

let initialized = false;

export function getFirebaseAdmin(): admin.app.App {
  if (initialized && admin.apps.length > 0) {
    return admin.app();
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error('User management API is not configured');
  }

  const serviceAccount = JSON.parse(raw) as admin.ServiceAccount;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
  return admin.app();
}

export function getAdminAuth(): admin.auth.Auth {
  return getFirebaseAdmin().auth();
}

export function getAdminFirestore(): admin.firestore.Firestore {
  return getFirebaseAdmin().firestore();
}
