import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface AccountScreenProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  children: ReactNode;
}

/**
 * The shell the three account screens share — back link, heading, one column.
 *
 * One column rather than the Settings page's masonry: everything on these screens is a form or a
 * ledger, and both are read top to bottom. A two-column flow would put "change your password"
 * beside "change your email" and invite filling in the wrong one.
 */
export function AccountScreen({ title, subtitle, onBack, children }: AccountScreenProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors focus-ring rounded-lg px-1 py-1"
      >
        <ArrowLeft size={16} />
        Back to dashboard
      </button>

      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}

interface AccountPanelProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function AccountPanel({ title, description, children }: AccountPanelProps) {
  return (
    <section className="panel-card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h2>
        {description && <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Success in green, failure in red, nothing at all when there is nothing to say. */
export function FormNote({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (success) return <p className="text-sm text-emerald-400">{success}</p>;
  return null;
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      <input
        {...input}
        className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm focus-ring disabled:opacity-60"
      />
      {hint && <span className="mt-1.5 block text-xs text-text-secondary">{hint}</span>}
    </label>
  );
}
