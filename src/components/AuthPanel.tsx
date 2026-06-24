import { useAuth } from '../context/AuthContext';

export function AuthPanel() {
  const { user, loading, firebaseEnabled, logout } = useAuth();

  if (!firebaseEnabled) {
    return (
      <div className="px-3 py-2 mx-3 mb-2 rounded-md bg-bg-tertiary border border-border">
        <p className="text-[10px] text-text-secondary leading-relaxed">
          Cloud sync off — add Firebase keys to <code className="text-accent">.env</code>
        </p>
      </div>
    );
  }

  if (loading || !user) {
    return null;
  }

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
