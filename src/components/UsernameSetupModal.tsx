import { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { UsernameField } from './UsernameField';
import { useAuth } from '../context/AuthContext';
import { UsernameTakenError } from '../services/username';
import { validateUsername } from '../utils/usernameValidation';

export function UsernameSetupModal() {
  const { user, claimUsername, logout } = useAuth();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateUsername(username);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setBusy(true);
    try {
      await claimUsername(username);
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        setError('That username is already taken. Try another.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not save username.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-bg-primary/95 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden glow-border shadow-2xl bg-bg-secondary p-6 md:p-8">
        <BrandLogo size="md" />
        <h2 className="text-xl font-bold mt-5 mb-2">Choose your username</h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          {user?.email ? (
            <>
              Welcome back! Pick a unique <strong className="text-text-primary">@username</strong> for your account
              ({user.email}). It appears on share cards and is permanent once claimed.
            </>
          ) : (
            <>
              Pick a unique <strong className="text-text-primary">@username</strong> for Trend Chasers. It appears on share cards and is
              permanent once claimed.
            </>
          )}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <UsernameField value={username} onChange={setUsername} currentUid={user?.uid} disabled={busy} />

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          <button type="submit" disabled={busy || !validateUsername(username).ok} className="w-full btn-primary py-3 text-base disabled:opacity-50">
            {busy ? 'Saving…' : 'Claim username'}
          </button>
          <button type="button" onClick={() => void logout()} className="w-full text-sm text-text-secondary hover:text-text-primary">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
