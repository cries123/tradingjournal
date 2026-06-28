import { useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2 } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { useAuth } from '../context/AuthContext';
import { submitBrokerSupportRequest } from '../services/brokerSupportRequests';

interface RequestBrokerPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
}

export function RequestBrokerPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
}: RequestBrokerPageProps) {
  const { user, username, firebaseEnabled } = useAuth();
  const [brokerName, setBrokerName] = useState('');
  const [exportMethod, setExportMethod] = useState('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const contactEmail = user?.email ?? email;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (brokerName.trim().length < 2) {
      setError('Please enter your broker name.');
      return;
    }

    if (exportMethod.trim().length < 3) {
      setError('Please describe how you export trades (CSV, screenshots, etc.).');
      return;
    }

    if (!contactEmail.trim()) {
      setError('Please enter an email so we can follow up.');
      return;
    }

    setBusy(true);
    try {
      await submitBrokerSupportRequest({
        brokerName,
        exportMethod,
        details,
        email: contactEmail.trim(),
        uid: user?.uid ?? null,
        username: username ?? null,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request. Please try again.');
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
            <Building2 size={22} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Request broker support</h1>
        </div>
        <p className="text-text-secondary mb-10 leading-relaxed">
          Tell us your broker and how you export trades. We will review your request and prioritize new
          import support.
        </p>

        {!firebaseEnabled ? (
          <div className="glass-card rounded-xl p-6 text-sm text-text-secondary">
            Broker support requests require the app to be connected to our backend. Please try again
            later.
          </div>
        ) : submitted ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Thanks — we got your request</h2>
            <p className="text-text-secondary text-sm mb-6">
              We will review support for {brokerName.trim()} and reach out at {contactEmail.trim()} if we
              need more details.
            </p>
            <button type="button" onClick={onHome} className="btn-primary text-sm px-5 py-2.5">
              Back to home
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 md:p-8 space-y-5">
            <div>
              <label htmlFor="broker-name" className="block text-sm font-medium mb-2">
                Broker name <span className="text-red-400">*</span>
              </label>
              <input
                id="broker-name"
                type="text"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                required
                minLength={2}
                placeholder="e.g. Interactive Brokers, Webull, Fidelity"
                className="input-field w-full"
              />
            </div>

            <div>
              <label htmlFor="export-method" className="block text-sm font-medium mb-2">
                How do you export trades? <span className="text-red-400">*</span>
              </label>
              <textarea
                id="export-method"
                value={exportMethod}
                onChange={(e) => setExportMethod(e.target.value)}
                rows={3}
                required
                minLength={3}
                placeholder="CSV from account statements, mobile app screenshots, manual copy-paste, etc."
                className="input-field w-full resize-y min-h-[96px]"
              />
            </div>

            <div>
              <label htmlFor="broker-details" className="block text-sm font-medium mb-2">
                Anything else? <span className="text-text-secondary font-normal">(optional)</span>
              </label>
              <textarea
                id="broker-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Sample file format, platform (mobile vs desktop), links to export docs…"
                className="input-field w-full resize-y min-h-[96px]"
              />
            </div>

            {!user && (
              <div>
                <label htmlFor="broker-email" className="block text-sm font-medium mb-2">
                  Your email <span className="text-red-400">*</span>
                </label>
                <input
                  id="broker-email"
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
              {busy ? 'Sending…' : 'Submit request'}
            </button>
          </form>
        )}
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} />
    </div>
  );
}
