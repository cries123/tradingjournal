import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PageFrame } from '../layout/PageFrame';

interface AccountScreenProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  onBack: () => void;
  /** 2 lays the panels out side by side on a wide screen; 1 keeps one full-width panel (a ledger). */
  columns?: 1 | 2;
  children: ReactNode;
}

/**
 * The shell the three account screens share.
 *
 * These were one 672px column, on the reasoning that a form is read top to bottom and that
 * "change your password" beside "change your email" invites filling in the wrong one. Beside the
 * Overview it read as a different, emptier product — two thirds of a wide screen was blank — so the
 * panels now sit two across. Each is its own titled card with its own button, which is what keeps
 * the two forms apart; a single long form split down the middle would not be.
 */
export function AccountScreen({ title, subtitle, icon, onBack, columns = 2, children }: AccountScreenProps) {
  return (
    <PageFrame title={title} subtitle={subtitle} icon={icon} onBack={onBack}>
      <div className={`grid gap-2 md:gap-3 items-start ${columns === 2 ? 'lg:grid-cols-2' : ''}`}>{children}</div>
    </PageFrame>
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
  if (success) return <p className="text-sm text-accent">{success}</p>;
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
