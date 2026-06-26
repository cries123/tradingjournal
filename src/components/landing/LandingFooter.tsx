import { BrandLogo } from '../BrandLogo';

interface LandingFooterProps {
  onPrivacy: () => void;
  onTerms: () => void;
  onHome?: () => void;
  onBrokers?: () => void;
}

export function LandingFooter({ onPrivacy, onTerms, onHome, onBrokers }: LandingFooterProps) {
  const goHomeSection = (hash: string) => (e: React.MouseEvent) => {
    if (onHome) {
      e.preventDefault();
      onHome();
      requestAnimationFrame(() => {
        document.getElementById(hash.replace('#', ''))?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };

  return (
    <footer className="relative z-10 mt-auto border-t border-border/50 bg-bg-secondary/40 shrink-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          <div className="sm:col-span-2 lg:col-span-1">
            {onHome ? (
              <button type="button" onClick={onHome} className="text-left hover:opacity-90 transition-opacity">
                <BrandLogo size="sm" variant="compact" />
              </button>
            ) : (
              <BrandLogo size="sm" variant="compact" />
            )}
            <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-xs">
              A professional journal for active traders. Import manually — we never ask for your brokerage login.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-3">Product</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a href="/#features" onClick={goHomeSection('#features')} className="hover:text-emerald-400 transition-colors">
                  Features
                </a>
              </li>
              <li>
                {onBrokers ? (
                  <button type="button" onClick={onBrokers} className="hover:text-emerald-400 transition-colors">
                    Supported brokers
                  </button>
                ) : (
                  <a href="/brokers" className="hover:text-emerald-400 transition-colors">Supported brokers</a>
                )}
              </li>
              <li>
                <a href="/#security" onClick={goHomeSection('#security')} className="hover:text-emerald-400 transition-colors">
                  Security
                </a>
              </li>
              <li>
                <a href="/app" className="hover:text-emerald-400 transition-colors">Open journal</a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <button type="button" onClick={onPrivacy} className="hover:text-emerald-400 transition-colors">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button type="button" onClick={onTerms} className="hover:text-emerald-400 transition-colors">
                  Terms of Service
                </button>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-3">Contact</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a
                  href="https://github.com/cries123/tradingjournal/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Request broker support
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@tradingjournal.app?subject=Broker%20support%20request"
                  className="hover:text-emerald-400 transition-colors"
                >
                  Email us
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-secondary">
          <p>© {new Date().getFullYear()} Trend Chasers. All rights reserved.</p>
          <p>Not affiliated with any brokerage. For journaling purposes only.</p>
        </div>
      </div>
    </footer>
  );
}

interface LandingNavProps {
  onLaunch: () => void;
  onHome?: () => void;
  onBrokers?: () => void;
  showBrokersLink?: boolean;
}

export function LandingNav({ onLaunch, onHome, onBrokers, showBrokersLink = true }: LandingNavProps) {
  return (
    <header className="relative z-10 border-b border-border/50 backdrop-blur-md bg-bg-primary/70 sticky top-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        {onHome ? (
          <button type="button" onClick={onHome} className="hover:opacity-90 transition-opacity">
            <BrandLogo size="sm" variant="compact" />
          </button>
        ) : (
          <BrandLogo size="sm" variant="compact" />
        )}
        <div className="flex items-center gap-3">
          {showBrokersLink && onBrokers && (
            <button
              type="button"
              onClick={onBrokers}
              className="hidden sm:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Brokers
            </button>
          )}
          <button type="button" onClick={onLaunch} className="btn-primary text-sm px-5 py-2.5">
            Open Journal
          </button>
        </div>
      </div>
    </header>
  );
}
