import { BrandLogo } from '../BrandLogo';
import { GUIDE_ARTICLES } from '../../seo/guides';

interface LandingFooterProps {
  onPrivacy: () => void;
  onTerms: () => void;
  onHome?: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onGuide?: (slug: string) => void;
}

export function LandingFooter({
  onPrivacy,
  onTerms,
  onHome,
  onBrokers,
  onGuides,
  onGuide,
}: LandingFooterProps) {
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-10">
          <div className="sm:col-span-2 lg:col-span-1">
            {onHome ? (
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  onHome();
                }}
                className="inline-flex items-center justify-start shrink-0 w-fit max-w-none hover:opacity-90 transition-opacity"
              >
                <BrandLogo size="sm" variant="compact" />
              </a>
            ) : (
              <a href="/" className="inline-flex items-center justify-start shrink-0 w-fit max-w-none">
                <BrandLogo size="sm" variant="compact" />
              </a>
            )}
            <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-xs">
              Free trading journal for active traders. Track performance on a P&L calendar — no brokerage login.
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
                <a
                  href="/brokers"
                  onClick={(e) => {
                    if (onBrokers) {
                      e.preventDefault();
                      onBrokers();
                    }
                  }}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Supported brokers
                </a>
              </li>
              <li>
                <a href="/app" className="hover:text-emerald-400 transition-colors">Open journal</a>
              </li>
              <li>
                <a
                  href="/guides"
                  onClick={(e) => {
                    if (onGuides) {
                      e.preventDefault();
                      onGuides();
                    }
                  }}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Guides
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-3">Guides</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              {GUIDE_ARTICLES.map((guide) => (
                <li key={guide.slug}>
                  <a
                    href={guide.path}
                    onClick={(e) => {
                      if (onGuide) {
                        e.preventDefault();
                        onGuide(guide.slug);
                      }
                    }}
                    className="hover:text-emerald-400 transition-colors"
                  >
                    {guide.title.replace(' — Trend Chasers', '').slice(0, 42)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    onPrivacy();
                  }}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    onTerms();
                  }}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-3">Contact</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a href="/report-bug" className="hover:text-emerald-400 transition-colors">
                  Report a bug
                </a>
              </li>
              <li>
                <a href="/request-broker" className="hover:text-emerald-400 transition-colors">
                  Request broker support
                </a>
              </li>
              <li>
                <a href="/admin" className="hover:text-emerald-400 transition-colors opacity-60">
                  Admin
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
  onGuides?: () => void;
  showBrokersLink?: boolean;
}

function NavBrand({ onHome }: { onHome?: () => void }) {
  const logo = <BrandLogo size="sm" variant="compact" />;
  const shellClass =
    'inline-flex items-center justify-start shrink-0 w-fit max-w-none p-0 m-0 border-0 bg-transparent text-left hover:opacity-90 transition-opacity focus-ring rounded';

  if (onHome) {
    return (
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          onHome();
        }}
        className={`${shellClass} cursor-pointer`}
      >
        {logo}
      </a>
    );
  }

  return (
    <a href="/" className={shellClass}>
      {logo}
    </a>
  );
}

export function LandingNav({ onLaunch, onHome, onBrokers, onGuides, showBrokersLink = true }: LandingNavProps) {
  return (
    <header className="relative z-10 border-b border-border/50 backdrop-blur-md bg-bg-primary/70 sticky top-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        <NavBrand onHome={onHome} />
        <nav className="flex items-center gap-3 shrink-0" aria-label="Main">
          {showBrokersLink && (
            <a
              href="/brokers"
              onClick={(e) => {
                if (onBrokers) {
                  e.preventDefault();
                  onBrokers();
                }
              }}
              className="hidden sm:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Brokers
            </a>
          )}
          <a
            href="/guides"
            onClick={(e) => {
              if (onGuides) {
                e.preventDefault();
                onGuides();
              }
            }}
            className="hidden sm:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Guides
          </a>
          <a
            href="/app"
            onClick={(e) => {
              e.preventDefault();
              onLaunch();
            }}
            className="btn-primary text-sm px-5 py-2.5"
          >
            Open Journal
          </a>
        </nav>
      </div>
    </header>
  );
}
