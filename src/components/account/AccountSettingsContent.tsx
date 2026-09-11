import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { authErrorCode, authErrorMessage } from '../../utils/authErrors';
import { RENAME_COOLDOWN_DAYS } from '../../config/accountRules';
import { AccountPanel, AccountScreen, Field, FormNote } from './AccountScreen';

interface AccountSettingsContentProps {
  onBack: () => void;
}

/**
 * Firebase failures arrive as a code; ours arrive as a sentence.
 *
 * authErrorMessage turns 'auth/wrong-password' into something readable, but it is given the code
 * rather than the error — so an Error thrown by this app ("Sign in again before…") would come out
 * the other side as the generic fallback and lose the only useful thing it said.
 */
function describe(err: unknown): string {
  const code = authErrorCode(err);
  if (code) return authErrorMessage(code);
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Try again.';
}

/**
 * Email, username and password, each its own form with its own result line.
 *
 * Separate forms rather than one "save account" button, because these three fail in completely
 * different ways — a taken username, a wrong current password, an unreachable new mailbox — and a
 * single form would have to report one of them against all three fields.
 */
export function AccountSettingsContent({ onBack }: AccountSettingsContentProps) {
  const { user, username, changeEmail, changePassword, renameUsername } = useAuth();

  /*
   * Google accounts have no password to re-authenticate with, so the email and password forms
   * cannot work for them at all. Showing disabled boxes would be a puzzle; saying so is not.
   */
  const hasPassword = Boolean(user?.providerData.some((p) => p.providerId === 'password'));

  return (
    <AccountScreen
      title="Account settings"
      subtitle="Your sign-in details. Everything else lives in Settings."
      onBack={onBack}
    >
      <UsernamePanel current={username} onRename={renameUsername} />

      {hasPassword ? (
        <>
          <EmailPanel currentEmail={user?.email ?? null} onChange={changeEmail} />
          <PasswordPanel onChange={changePassword} />
        </>
      ) : (
        <AccountPanel
          title="Email and password"
          description="You sign in with Google, so there is no password here to change — your email address and password are managed in your Google account."
        >
          <a
            href="https://myaccount.google.com/security"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex text-sm text-accent hover:underline focus-ring rounded"
          >
            Open Google account security →
          </a>
        </AccountPanel>
      )}
    </AccountScreen>
  );
}

function UsernamePanel({
  current,
  onRename,
}: {
  current: string | null;
  onRename: (name: string) => Promise<string>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const taken = await onRename(value);
      setSuccess(`You are now @${taken}.`);
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your username.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountPanel
      title="Username"
      description={`Your old handle stays reserved to you rather than going back in the pool, so nobody can pick up a name you traded under. You can change it once every ${RENAME_COOLDOWN_DAYS} days.`}
    >
      <p className="text-sm">
        Currently <span className="font-medium text-accent">@{current ?? '—'}</span>
      </p>

      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field
          label="New username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          autoComplete="off"
          maxLength={20}
          hint="3–20 characters · letters, numbers and underscores"
        />
        <FormNote error={error} success={success} />
        <button
          type="submit"
          disabled={busy || value.trim().length < 3}
          className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? 'Changing…' : 'Change username'}
        </button>
      </form>
    </AccountPanel>
  );
}

function EmailPanel({
  currentEmail,
  onChange,
}: {
  currentEmail: string | null;
  onChange: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await onChange(email, password);
      setSuccess(`Check ${email.trim()} for a confirmation link. Your address changes when you click it.`);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountPanel
      title="Email address"
      description="We send the confirmation to the new address first. Nothing changes until you click the link in it, so a typo costs you nothing."
    >
      <p className="text-sm">
        Currently <span className="font-medium">{currentEmail ?? '—'}</span>
      </p>

      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field
          label="New email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          autoComplete="email"
          required
        />
        <Field
          label="Current password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          autoComplete="current-password"
          required
          hint="Asked for because changing the address on an account is how an account gets stolen."
        />
        <FormNote error={error} success={success} />
        <button
          type="submit"
          disabled={busy || !email.trim() || !password}
          className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? 'Sending…' : 'Send confirmation link'}
        </button>
      </form>
    </AccountPanel>
  );
}

function PasswordPanel({
  onChange,
}: {
  onChange: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await onChange(current, next);
      setSuccess('Password changed.');
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountPanel title="Password">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field
          label="Current password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={busy}
          autoComplete="current-password"
          required
        />
        <Field
          label="New password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
          minLength={6}
          required
          hint="At least 6 characters."
        />
        <FormNote error={error} success={success} />
        <button
          type="submit"
          disabled={busy || !current || next.length < 6}
          className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </AccountPanel>
  );
}
