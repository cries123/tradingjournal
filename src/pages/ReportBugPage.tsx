import { useState } from 'react';
import { ArrowLeft, Bug, CheckCircle2 } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { useAuth } from '../context/AuthContext';
import { submitBugReport } from '../services/bugReports';

interface ReportBugPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
}

export function ReportBugPage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers }: ReportBugPageProps) {
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
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} />

      <main className="relative z-10 flex-1 max-w-2xl mx-auto px-4 md:px-6 py-12 md:py-16 w-full">
        <button
          type="button"
          onClick={onHome}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to home
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Bug size={22} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Report a bug</h1>
        </div>
        <p className="text-text-secondary mb-10 leading-relaxed">
          Found something broken or confusing? Tell us what happened and we will look into it.
        </p>

        {!firebaseEnabled ? (
          <div className="glass-card rounded-xl p-6 text-sm text-text-secondary">
            Bug reporting requires the app to be connected to our backend. Please email{' '}
            <a href="mailto:support@tradingjournal.app" className="text-emerald-400 hover:underline">
              support@tradingjournal.app
            </a>{' '}
            instead.
          </div>
        ) : submitted ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Thanks — we got your report</h2>
            <p className="text-text-secondary text-sm mb-6">
              We will review it and reach out at {contactEmail.trim()} if we need more details.
            </p>
            <button type="button" onClick={onHome} className="btn-primary text-sm px-5 py-2.5">
              Back to home
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 md:p-8 space-y-5">
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
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} />
    </div>
  );
}
