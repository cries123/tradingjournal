import { useState } from 'react';
import { BarChart3, Calendar, Upload, X } from 'lucide-react';

const STORAGE_KEY = 'trend-chasers-onboarding-done';

const STEPS = [
  {
    icon: Upload,
    title: 'Import your trades',
    body: 'Drop a broker CSV, upload a screenshot, or log trades manually — no broker login required.',
  },
  {
    icon: Calendar,
    title: 'Review on the calendar',
    body: 'Green days are winners, red days are losers. Click any day to see or edit that session.',
  },
  {
    icon: BarChart3,
    title: 'Analyze your edge',
    body: 'Filter by setup tag, check win rate and profit factor, and switch between month and year views.',
  },
];

export function hasCompletedOnboarding(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function markOnboardingDone(): void {
  localStorage.setItem(STORAGE_KEY, '1');
}

interface OnboardingOverlayProps {
  onDone: () => void;
}

export function OnboardingOverlay({ onDone }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;

  const finish = () => {
    markOnboardingDone();
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-border/80 rounded-2xl p-6 md:p-8 w-full max-w-md shadow-2xl animate-scale-in relative">
        <button
          type="button"
          onClick={finish}
          className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-text-primary focus-ring rounded"
          aria-label="Skip onboarding"
        >
          <X size={18} />
        </button>

        <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-4">
          Step {step + 1} of {STEPS.length}
        </p>
        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-4">
          <Icon size={24} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">{current.title}</h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">{current.body}</p>

        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-emerald-400' : 'bg-border'}`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step < STEPS.length - 1 ? (
            <>
              <button type="button" onClick={() => setStep((s) => s + 1)} className="flex-1 btn-primary py-2.5 text-sm">
                Next
              </button>
              <button type="button" onClick={finish} className="px-4 py-2.5 btn-secondary text-sm">
                Skip
              </button>
            </>
          ) : (
            <button type="button" onClick={finish} className="w-full btn-primary py-2.5 text-sm">
              Get started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
