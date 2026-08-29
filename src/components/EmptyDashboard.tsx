import { ArrowRight, Link2, Plus, Sparkles } from 'lucide-react';

interface EmptyDashboardProps {
  onAddTrade: () => void;
  onConnectBroker: () => void;
  onLoadSample?: () => void;
}

const PREVIEW_POINTS = [
  'A P&L calendar that colours every session green or red',
  'Win rate judged against the rate your win/loss actually needs',
  'Which setups pay and which ones bleed, ranked',
];

/**
 * First screen for a journal with nothing in it.
 *
 * The sample month is deliberately the most prominent option rather than a footnote. Someone
 * landing here has no data of their own, so every other button asks them to do work before they
 * can see whether the thing is any good; loading the example is the only path that shows them
 * the product first. Connecting a broker and logging a trade stay one tap away for people who
 * already know they want in.
 */
export function EmptyDashboard({ onAddTrade, onConnectBroker, onLoadSample }: EmptyDashboardProps) {
  return (
    <div className="panel-card p-5 md:p-8 shrink-0">
      <div className="max-w-2xl mx-auto">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/25 flex items-center justify-center mx-auto mb-3">
            <Plus size={24} className="text-accent" />
          </div>
          <h3 className="text-lg md:text-xl font-semibold mb-1.5">Start your journal</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Connect a broker to sync automatically, log a session by hand, or take a look around
            with an example month first.
          </p>
        </div>

        {onLoadSample && (
          <button
            type="button"
            onClick={onLoadSample}
            className="group w-full mt-5 rounded-xl border border-accent/30 bg-accent/[0.07] hover:bg-accent/[0.12] hover:border-accent/50 transition-colors p-4 text-left focus-ring"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-accent shrink-0" />
              <span className="text-sm font-semibold text-text-primary">
                Explore a filled-in example month
              </span>
              <ArrowRight
                size={15}
                className="ml-auto shrink-0 text-accent transition-transform group-hover:translate-x-0.5"
              />
            </div>
            <ul className="space-y-1">
              {PREVIEW_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-accent/70 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-text-secondary/70 mt-2.5">
              Nothing is saved — the example clears the moment you add a real trade.
            </p>
          </button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <button
            type="button"
            onClick={onConnectBroker}
            className="flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm flex-1"
          >
            <Link2 size={16} />
            Connect broker
          </button>
          <button
            type="button"
            onClick={onAddTrade}
            className="flex items-center justify-center gap-2 btn-primary py-2.5 text-sm flex-1"
          >
            <Plus size={16} />
            Log a trade
          </button>
        </div>
      </div>
    </div>
  );
}
