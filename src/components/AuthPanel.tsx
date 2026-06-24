import { useAuth } from '../context/AuthContext';

export function AuthPanel() {
  const { user, loading, firebaseEnabled, signInWithGoogle, logout } = useAuth();

  if (!firebaseEnabled) {
    return (
      <div className="px-3 py-2 mx-3 mb-2 rounded-md bg-bg-tertiary border border-border">
        <p className="text-[10px] text-text-secondary leading-relaxed">
          Cloud sync off — add Firebase keys to <code className="text-accent">.env</code>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-3 py-2 mx-3 mb-2 text-xs text-text-secondary">
        Connecting…
      </div>
    );
  }

  if (user) {
    return (
      <div className="px-3 py-2 mx-3 mb-2 rounded-md bg-bg-tertiary border border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-profit-bright shrink-0" />
          <p className="text-xs text-text-primary truncate flex-1">
            {user.email ?? 'Signed in'}
          </p>
        </div>
        <p className="text-[10px] text-text-secondary mb-2">Trades sync to Firebase</p>
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full py-1.5 text-xs border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 mx-3 mb-2 rounded-md bg-bg-tertiary border border-border">
      <p className="text-[10px] text-text-secondary mb-2">Sign in to save trades to the cloud</p>
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="w-full py-2 text-xs bg-white text-gray-900 rounded-md font-medium hover:opacity-90 transition-opacity"
      >
        Sign in with Google
      </button>
    </div>
  );
}
