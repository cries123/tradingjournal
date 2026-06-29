import { useState } from 'react';
import { ArrowLeft, Bug, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { submitBugReport } from '../../services/bugReports';

interface ReportBugContentProps {
  onBack: () => void;
  backLabel?: string;
}

export function ReportBugContent({ onBack, backLabel = 'Back to dashboard' }: ReportBugContentProps) {
  const { user, username, firebaseEnabled } = useAuth();
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const contactEmail = user?.email ?? email;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (description.trim().length < 10) {
      setError('Please describe the bug in at least 10 characters.');
      return;
    }

    if (!contactEmail.trim()) {
      setError('Please enter an email so we can follow up.');
      return;
    }

    setBusy(true);
    try {
      await submitBugReport({
        description,
        steps,
        email: contactEmail.trim(),
        uid: user?.uid ?? null,
        username: username ?? null,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-6">
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Bug size={22} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Report a bug</h1>
        </div>
        <p className="text-text-secondary mb-8 leading-relaxed">
          Found something broken or confusing? Tell us what happened and we will look into it.
        </p>

        {!firebaseEnabled ? (
          <div className="panel-card p-6 text-sm text-text-secondary">
            Bug reporting requires the app to be connected to our backend. Please use{' '}
            <a href="https://github.com/cries123/tradingjournal/issues/new" className="text-emerald-400 hover:underline">
              GitHub Issues
            </a>{' '}
            instead.
          </div>
        ) : submitted ? (
          <div className="panel-card p-8 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Thanks — we got your report</h2>
            <p className="text-text-secondary text-sm mb-6">
              We will review it and reach out at {contactEmail.trim()} if we need more details.
            </p>
            <button type="button" onClick={onBack} className="btn-primary text-sm px-5 py-2.5">
              {backLabel}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="panel-card p-6 md:p-8 space-y-5">
            <div>
              <label htmlFor="bug-description" className="block text-sm font-medium mb-2">
                What went wrong? <span className="text-red-400">*</span>
              </label>
              <textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                required
                minLength={10}
                placeholder="Describe the bug — what you expected vs what actually happened."
                className="input-field w-full resize-y min-h-[120px]"
              />
            </div>

            <div>
              <label htmlFor="bug-steps" className="block text-sm font-medium mb-2">
                Steps to reproduce <span className="text-text-secondary font-normal">(optional)</span>
              </label>
              <textarea
                id="bug-steps"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={3}
                placeholder="1. Go to…&#10;2. Click…&#10;3. See error…"
                className="input-field w-full resize-y min-h-[96px]"
              />
            </div>

            {!user && (
              <div>
                <label htmlFor="bug-email" className="block text-sm font-medium mb-2">
                  Your email <span className="text-red-400">*</span>
                </label>
                <input
                  id="bug-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="input-field w-full"
                />
              </div>
            )}

            {user && (
              <p className="text-xs text-text-secondary">
                Signed in as {user.email}
                {username ? ` (@${username})` : ''}. We will use this account to follow up.
              </p>
            )}

            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full sm:w-auto px-6 py-2.5">
              {busy ? 'Sending…' : 'Submit report'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
