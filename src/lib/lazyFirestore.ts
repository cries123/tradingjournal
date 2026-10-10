/**
 * Firestore, loaded the first time something asks for it rather than with the page.
 *
 * For the handful of modules that are reachable from src/main.tsx without a dynamic import — the
 * auth and settings contexts, the visitor counter, the landing page's announcement bar and broker
 * list. Each of them used to import 'firebase/firestore' statically, which made Firestore part of
 * the entry: every visitor downloaded and evaluated 135 KB (compressed) of database client before
 * the landing page was interactive, to read two small config documents after it was.
 *
 * Now the first caller pays for the download, in the background, and every later caller gets the
 * same promise. The db instance is the one lib/firebase.ts configures — persistent cache and all —
 * so there is still exactly one Firestore in the page.
 */

type FirestoreModule = typeof import('firebase/firestore');
type Db = ReturnType<typeof import('./firebase')['getFirebaseDb']>;

let loading: Promise<{ fs: FirestoreModule; db: Db }> | null = null;

export function lazyFirestore(): Promise<{ fs: FirestoreModule; db: Db }> {
  if (!loading) {
    loading = Promise.all([import('firebase/firestore'), import('./firebase')]).then(
      ([fs, firebase]) => ({ fs, db: firebase.getFirebaseDb() }),
    );
    // A failed chunk load must not poison every later caller for the life of the tab: drop the
    // cached promise so the next call tries again.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
