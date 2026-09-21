import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { signInWithCustomToken } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';
import { adminImpersonate } from '../../services/adminUserManagement';
import { ConfirmDialog } from '../ConfirmDialog';

/**
 * Signs the admin in as a customer.
 *
 * Real impersonation, with everything that implies: the session this produces IS them. Firestore
 * sees their uid, so anything written goes into their account and their history, and there is no
 * way to make the database attribute it elsewhere. The token carries an impersonatedBy claim so
 * the app can at least say afterwards who was holding the keyboard.
 *
 * It also replaces the admin's own session — Firebase holds one signed-in user per app — so this
 * signs them out of their own account until they sign back in. The dialog says so, because
 * discovering it afterwards is how somebody ends up locked out mid-support-call.
 */
export function AdminImpersonateButton({ uid, label }: { uid: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await adminImpersonate(uid);

      /* Remembered before the sign-in, because the moment it lands this tab is them and the admin
         session is gone — including any state that could tell the banner whose account it is. */
      try {
        sessionStorage.setItem(
          'trend-chasers-impersonating',
          JSON.stringify({ label, uid, at: Date.now() }),
        );
      } catch {
        // Banner just will not appear; the session still works.
      }

      await signInWithCustomToken(getFirebaseAuth(), token);
      window.location.assign('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session.');
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300/90 hover:bg-amber-500/10 transition-colors focus-ring disabled:opacity-50"
      >
        <LogIn size={12} />
        {busy ? 'Starting…' : 'Sign in as them'}
      </button>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {confirming && (
        <ConfirmDialog
          title={`Sign in as ${label}?`}
          message={
            'You will be signed out of your own account and into theirs until you sign back in. ' +
            'Everything you do lands in their account and their history — if you clear their journal, ' +
            'their trades are gone and the app records it against them. Use the read-only view above ' +
            'if you only need to look.'
          }
          confirmLabel="Sign in as them"
          danger
          onConfirm={() => {
            setConfirming(false);
            void start();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
