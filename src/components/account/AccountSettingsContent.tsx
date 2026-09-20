import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { authErrorCode, authErrorMessage } from '../../utils/authErrors';
import { RENAME_COOLDOWN_DAYS } from '../../config/accountRules';
import { deleteOwnAccount } from '../../services/account';
import { refreshEmailVerified, resendEmailVerification } from '../../services/entitlement';
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

      <VerifyEmailPanel />

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

      <DeleteAccountPanel />
    </AccountScreen>
  );
}

/**
 * Confirming the email address — the half of this that was already written and never wired up.
 *
 * resendEmailVerification and refreshEmailVerified have existed in services/entitlement since the
 * trial shipped, with no caller anywhere in the app. Meanwhile the server refuses a free trial on
 * an unconfirmed address and tells the person "Confirm your email address first — we have sent you
 * a link". If that email bounced, went to spam, or was simply never sent, there was no button
 * anywhere to send another one: a dead end at the exact moment somebody is trying to start paying.
 *
 * Hidden once the address is confirmed, because then it is a panel about nothing.
 */
function VerifyEmailPanel() {
  const { user } = useAuth();
  const [verified, setVerified] = useState(user?.emailVerified ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user || verified) return null;

  const resend = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await resendEmailVerification();
      setSuccess('Sent. Open the link in that email, then come back and press "I have confirmed it".');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const recheck = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      // The link is opened in another tab and nothing tells this one about it.
      const now = await refreshEmailVerified();
      setVerified(now);
      if (!now) setError('Still not confirmed. Open the link in the email first.');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountPanel
      title="Confirm your email"
      description="Your address has not been confirmed yet. Trial offers, receipts and the weekly recap all go there, so an unconfirmed address means silence rather than a bounce anybody notices."
    >
      <FormNote error={error} success={success} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy}
          className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? 'Working…' : 'Send the link again'}
        </button>
        <button
          type="button"
          onClick={() => void recheck()}
          disabled={busy}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-ring disabled:opacity-60"
        >
          I have confirmed it
        </button>
      </div>
    </AccountPanel>
  );
}

/**
 * Leaving, properly.
 *
 * There was no way to do this at all — deletion was admin-only, so the only route out was emailing
 * support and waiting. For a paid product that holds somebody's entire trading history, "you can
 * take your data and go" is both the decent answer and the one a privacy request expects.
 *
 * Typing DELETE rather than clicking twice: this removes every trade, note and journal with no
 * export afterwards and no way back. The word is checked again on the server, because a
 * confirmation that only exists in the dialog is not a confirmation.
 */
function DeleteAccountPanel() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteOwnAccount(typed);
      // The Auth user is already gone server-side; this clears the local session and cached name
      // so the app does not sit on a signed-in shell pointing at nothing.
      await logout().catch(() => undefined);
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
      setBusy(false);
    }
  };

  return (
    <section className="panel-card border-red-500/25 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400">Delete account</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          Removes your account and everything in it — every trade, note, journal and broker
          connection. This cannot be undone and there is no copy afterwards, so download a CSV
          backup from Settings first if you want one. Any subscription stops billing.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 focus-ring"
        >
          Delete my account
        </button>
      ) : (
        <div className="space-y-3">
          <Field
            label="Type DELETE to confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
          <FormNote error={error} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy || typed.trim().toUpperCase() !== 'DELETE'}
              className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus-ring disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Delete everything'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped('');
                setError(null);
              }}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-ring disabled:opacity-60"
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
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
