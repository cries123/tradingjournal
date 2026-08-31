import { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { Starfield } from './Starfield';
import { UsernameField } from './UsernameField';
import { useAuth } from '../context/AuthContext';
import { UsernameTakenError } from '../services/username';
import {
  isGoogleSignInAvailable,
  recordGoogleConfigFailure,
} from '../services/googleSignIn';
import {
  authErrorCode,
  authErrorMessage,
  isGoogleConfigError,
  isUserCancellation,
} from '../utils/authErrors';
import { validateUsername } from '../utils/usernameValidation';

type Mode = 'login' | 'signup' | 'reset';

// Only things a free account actually gets. Broker sync moved behind a plan, and listing it as a
// signup benefit would be selling something the account they're creating doesn't include.
const BENEFITS = [
  'Log unlimited trades — free, no card',
  'See which setups pay and which ones bleed',
  'Know if you exit winners too early',
  'Your journal syncs across every device',
];

export function AuthModal() {
  const { signInWithGoogle, signInWithEmail, createAccount, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  /* Read once on mount rather than on every render: it consults localStorage, and the value can
     only change as a result of an attempt made from this very component. */
  const [googleAvailable, setGoogleAvailable] = useState(() => isGoogleSignInAvailable());

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
      setError(authErrorMessage(code));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      const validation = validateUsername(username);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        await createAccount(email.trim(), password, username);
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        setError('That username is already taken. Try another.');
      } else if (err instanceof Error && err.message && !('code' in err)) {
        setError(err.message);
      } else {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
        setError(authErrorMessage(code));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = authErrorCode(err);

      // Closing the popup is a decision, not a failure. Reporting it as an error is what makes a
      // working sign-in flow look broken to anyone who changes their mind halfway through.
      if (isUserCancellation(code)) {
        return;
      }

      if (isGoogleConfigError(code)) {
        // This will fail identically every time until someone changes a Firebase console setting,
        // so stop offering the button rather than handing the next visitor the same dead end.
        console.error(`[auth] Google sign-in is misconfigured for this domain: ${code}`);
        recordGoogleConfigFailure(code);
        setGoogleAvailable(false);
        setError(authErrorMessage(code));
        return;
      }

      // Everything else can genuinely succeed on a retry, so the button stays.
      console.error('[auth] Google sign-in failed:', code || err);
      setError(authErrorMessage(code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-primary/95 backdrop-blur-md p-4 md:p-8 overflow-y-auto overflow-x-hidden animate-backdrop-in motion-safe:animate-backdrop-in">
      <Starfield />
      <div className="landing-grid pointer-events-none fixed inset-0 opacity-50" aria-hidden />

      <div className="relative w-full max-w-4xl grid md:grid-cols-5 rounded-2xl overflow-hidden glow-border shadow-2xl shadow-black/50 my-auto animate-scale-in motion-safe:animate-scale-in">
        {/* Brand panel */}
        <div className="md:col-span-2 bg-gradient-to-br from-profit-bright/15 via-bg-secondary to-accent/10 border-b md:border-b-0 md:border-r border-border/50 p-6 md:p-10 flex flex-col justify-between">
          <div>
            <div className="md:hidden">
              <BrandLogo size="md" variant="compact" />
            </div>
            <div className="hidden md:block">
              <BrandLogo size="lg" variant="full" />
            </div>
            <h2 className="text-xl md:text-3xl font-bold mt-5 md:mt-8 leading-tight">
              {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
            </h2>
            <p className="text-text-secondary mt-3 text-sm leading-relaxed">
              {mode === 'login'
                ? 'Sign in to sync your journal to the cloud and access it from any device.'
                : mode === 'signup'
                  ? 'Free to start. Connect a broker for automatic syncing, or log trades by hand — switch anytime.'
                  : 'Enter your email and we\'ll send a link to reset your password.'}
            </p>
          </div>

          <ul className="mt-8 space-y-3 hidden md:block">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-sm text-text-secondary">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs shrink-0">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Form panel */}
        <div className="md:col-span-3 bg-bg-secondary/95 p-6 md:p-10">
          {mode !== 'reset' && (
          <div className="flex rounded-lg bg-bg-primary/60 p-1 mb-8 border border-border/50">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setResetSent(false); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                mode === 'login'
                  ? 'bg-accent/20 text-accent shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); setResetSent(false); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                mode === 'signup'
                  ? 'bg-accent/20 text-accent shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Create account
            </button>
          </div>
          )}

          {mode === 'reset' ? (
            <form onSubmit={(e) => void handleReset(e)} className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-text-secondary mb-1.5 block uppercase tracking-wide">Email address</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field py-3" placeholder="you@example.com" />
              </label>
              {resetSent ? (
                <div className="rounded-lg bg-profit-bright/10 border border-profit-bright/30 px-4 py-3 text-sm text-profit-bright">
                  Reset link sent! Check your inbox.
                </div>
              ) : null}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">{error}</div>
              )}
              <button type="submit" disabled={busy || resetSent} className="w-full btn-primary py-3.5 text-base disabled:opacity-50">
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(null); setResetSent(false); }} className="w-full text-sm text-text-secondary hover:text-text-primary">
                ← Back to sign in
              </button>
            </form>
          ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary mb-1.5 block uppercase tracking-wide">
                Email address
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field py-3"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary mb-1.5 block uppercase tracking-wide">
                Password
              </span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field py-3"
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
              />
            </label>
            {mode === 'signup' && (
              <UsernameField value={username} onChange={setUsername} disabled={busy} />
            )}
            {mode === 'login' && (
              <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(null); setResetSent(false); }}
                  className="text-xs text-accent hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || (mode === 'signup' && !validateUsername(username).ok)}
              className="w-full btn-primary py-3.5 text-base disabled:opacity-50 disabled:transform-none"
            >
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in to journal' : 'Create account'}
            </button>
          </form>
          )}

          {/* The whole Google block, divider included, is gated on availability. A button that
              cannot work is worse than no button: it looks like the product is broken, and it
              sends people away rather than to the email form directly beneath it. */}
          {mode !== 'reset' && googleAvailable && (
          <>
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border/60" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-border/60" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGoogle()}
            className="w-full py-3 rounded-lg bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-xs text-text-secondary mt-6 leading-relaxed">
            By continuing, you agree that this is for personal trade journaling only.
            We never access your brokerage account.
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
