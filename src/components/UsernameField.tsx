import { useEffect, useState } from 'react';
import { isUsernameAvailable } from '../services/username';
import { validateUsername } from '../utils/usernameValidation';

interface UsernameFieldProps {
  value: string;
  onChange: (value: string) => void;
  currentUid?: string;
  disabled?: boolean;
}

export function UsernameField({ value, onChange, currentUid, disabled }: UsernameFieldProps) {
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const validation = value.trim() ? validateUsername(value) : null;
  const formatError = validation && !validation.ok ? validation.error : null;

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setAvailable(null);
      setChecking(false);
      return;
    }

    const result = validateUsername(trimmed);
    if (!result.ok) {
      setAvailable(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    const timer = window.setTimeout(() => {
      void isUsernameAvailable(result.normalized, currentUid)
        .then(setAvailable)
        .finally(() => setChecking(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [value, currentUid]);

  const showTaken = available === false && !formatError;
  const showAvailable = available === true && !formatError;

  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary mb-1.5 block uppercase tracking-wide">Username</span>
      <div className="flex items-center gap-1.5 input-field py-3 px-3 focus-within:border-emerald-500/50 focus-within:shadow-[0_0_0_3px_rgba(52,211,153,0.1)]">
        <span className="text-text-secondary text-base font-medium shrink-0 select-none" aria-hidden>
          @
        </span>
        <input
          type="text"
          required
          autoComplete="username"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent border-0 p-0 text-base text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-0"
          placeholder="yourname"
          minLength={3}
          maxLength={20}
        />
      </div>
      <p className="text-[11px] text-text-secondary mt-1.5">3–20 characters · letters, numbers, underscores · unique forever</p>
      {formatError && <p className="text-[11px] text-red-400 mt-1">{formatError}</p>}
      {checking && !formatError && value.trim() && (
        <p className="text-[11px] text-text-secondary mt-1">Checking availability…</p>
      )}
      {showTaken && <p className="text-[11px] text-red-400 mt-1">That username is already taken.</p>}
      {showAvailable && <p className="text-[11px] text-emerald-400 mt-1">Username is available.</p>}
    </label>
  );
}
