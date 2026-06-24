import { useAuth } from '../context/AuthContext';

export function AuthPanel({ compact = false }: { compact?: boolean }) {
  const { user, loading, firebaseEnabled, logout } = useAuth();

  if (!firebaseEnabled) {
    if (compact) return null;
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

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void logout()}
        className="flex flex-col items-center justify-center gap-0.5 w-full text-text-secondary hover:text-text-primary"
        title={user.email ?? 'Signed in — tap to sign out'}
      >
        <span className="w-2.5 h-2.5 rounded-full bg-profit-bright" />
        <span className="text-[9px] truncate max-w-full px-1">Out</span>
      </button>
    );
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
