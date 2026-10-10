import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Admin SDK on its modular entry points.
 *
 * firebase-admin 14 removes the legacy namespace API, and 14 is where the SDK's remaining dependency
 * advisories are fixed. Migrating to firebase-admin/app, /auth and /firestore first means the
 * upgrade is a version bump — these pin the behaviour the old code had, on the new API.
 */

const apps: { name: string }[] = [];
const initializeApp = vi.fn((opts: unknown) => {
  const app = { name: `app-${apps.length}`, opts };
  apps.push(app);
  return app;
});

vi.mock('firebase-admin/app', () => ({
  getApps: () => apps,
  initializeApp: (opts: unknown) => initializeApp(opts),
  cert: (sa: unknown) => ({ cert: sa }),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: (app: unknown) => ({ authFor: app }) }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: (app: unknown) => ({ dbFor: app }) }));

const { getAdminAuth, getAdminFirestore, getFirebaseAdmin } = await import('../../server/firebaseAdmin');

describe('the admin app', () => {
  beforeEach(() => {
    apps.length = 0;
    initializeApp.mockClear();
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'p', client_email: 'e' });
  });

  it('initialises once and reuses the app on every later call', () => {
    // A second initializeApp on a warm Lambda throws "already exists" — the reuse is not optional.
    const first = getFirebaseAdmin();
    const second = getFirebaseAdmin();
    expect(second).toBe(first);
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it('builds the credential from the service-account env var', () => {
    getFirebaseAdmin();
    expect(initializeApp).toHaveBeenCalledWith({ credential: { cert: { project_id: 'p', client_email: 'e' } } });
  });

  it('says it is not configured rather than crashing on JSON.parse of nothing', () => {
    // A missing env var is the most common cause of every admin action returning 503; the message
    // is what RECOVERY.md tells the owner to look for.
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
    expect(() => getFirebaseAdmin()).toThrow('User management API is not configured');
  });

  it('hands auth and Firestore the same app', () => {
    const app = getFirebaseAdmin();
    expect(getAdminAuth()).toEqual({ authFor: app });
    expect(getAdminFirestore()).toEqual({ dbFor: app });
  });
});

describe('nothing left on the legacy API', () => {
  it('has no server module importing the firebase-admin namespace', () => {
    // `import admin from 'firebase-admin'` stops compiling on 14. Anything new written that way would
    // turn the version bump back into a migration.
    const files = [
      ...readdirSync('server').filter((f) => f.endsWith('.ts')).map((f) => `server/${f}`),
      ...readdirSync('netlify/functions').filter((f) => /\.m?ts$/.test(f)).map((f) => `netlify/functions/${f}`),
    ];
    expect(files.length).toBeGreaterThan(40);

    const offenders = files.filter((file) => /from 'firebase-admin';/.test(readFileSync(join(process.cwd(), file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
