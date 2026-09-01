import { ArrowRight, Building2, GraduationCap, LifeBuoy, MessageSquareWarning, Ticket } from 'lucide-react';

export type SupportDestination = 'tutorials' | 'brokers' | 'help' | 'report' | 'ticket';

interface SupportLinksProps {
  /** The page this renders on, so it never links to where you already are. */
  current: SupportDestination;
  onGuides?: () => void;
  onBrokers?: () => void;
  onHelp?: () => void;
  onReportBug?: () => void;
  onSupport?: () => void;
}

const ICONS = {
  tutorials: GraduationCap,
  brokers: Building2,
  help: LifeBuoy,
  report: MessageSquareWarning,
  ticket: Ticket,
} as const;

const COPY: Record<SupportDestination, { title: string; blurb: string }> = {
  tutorials: { title: 'Tutorials', blurb: 'Step-by-step walkthroughs for setting up and using your journal.' },
  brokers: { title: 'Supported brokers', blurb: 'Check whether yours connects, and how its import works.' },
  help: { title: 'Help Center', blurb: 'Short answers to specific questions, organised by area.' },
  report: { title: 'Report a bug', blurb: "Something broken or behaving oddly? Tell us and we'll look." },
  ticket: { title: 'Open a ticket', blurb: 'Billing, memberships or anything that needs a real reply.' },
};

/**
 * Cross-links between the three places help lives.
 *
 * Tutorials, Brokers and the Help Center each answer a different kind of question, and each was a
 * dead end — you could only move between them through the top nav, which means starting over. A
 * reader who didn't find their answer here is best served by being pointed at the one that has it.
 *
 * It also fills the bottom of a page that is short, which the Help Center is whenever there are
 * few published articles.
 */
export function SupportLinks({ current, onGuides, onBrokers, onHelp, onReportBug, onSupport }: SupportLinksProps) {
  const handlers: Record<SupportDestination, (() => void) | undefined> = {
    tutorials: onGuides,
    brokers: onBrokers,
    help: onHelp,
    report: onReportBug,
    ticket: onSupport,
  };

  const destinations = (['tutorials', 'brokers', 'help', 'report', 'ticket'] as SupportDestination[]).filter(
    (d) => d !== current && handlers[d],
  );

  if (destinations.length === 0) return null;

  return (
    <section className="border-t border-border/40 pt-8">
      <h2 className="text-sm font-semibold text-text-primary mb-1">Still stuck?</h2>
      <p className="text-xs text-text-secondary mb-5">Try one of these instead.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((d) => {
          const Icon = ICONS[d];
          return (
            <button
              key={d}
              type="button"
              onClick={handlers[d]}
              className="group flex flex-col rounded-xl border border-border/50 bg-bg-secondary/40 p-4 text-left transition-colors hover:border-accent/40 hover:bg-bg-secondary focus-ring"
            >
              <Icon size={16} className="text-accent mb-2.5" />
              <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                {COPY[d].title}
              </p>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed flex-1">{COPY[d].blurb}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
                Go
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
