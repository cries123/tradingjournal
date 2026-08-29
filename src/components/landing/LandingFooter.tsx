import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { ProductsDropdown } from './ProductsDropdown';
import { MobileNavPanel } from './MobileNavPanel';
import { BROKER_GUIDES } from '../../seo/brokerGuides';
import { GUIDE_ARTICLES } from '../../seo/guides';
import type { ExtraNavRoute } from '../../hooks/useRoute';

interface LandingFooterProps {
  onPrivacy: () => void;
  onTerms: () => void;
  onHome?: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onGuide?: (slug: string) => void;
  /** Client-side nav for the Help Center / What's New / bug / broker-request links. Without it
   *  those anchors fall back to a full page load, which works but flashes. */
  onNavigate?: (route: ExtraNavRoute) => void;
  onLaunch?: () => void;
}

/** Wraps a plain href so it navigates client-side when a handler exists, and stays a real link
 *  (crawlable, middle-clickable, and still functional) when one doesn't. */
function navHandler(handler?: () => void) {
  return (e: React.MouseEvent) => {
    if (!handler) return;
    e.preventDefault();
    handler();
  };
}

export function LandingFooter({
  onPrivacy,
  onTerms,
  onHome,
  onBrokers,
  onGuides,
  onGuide,
  onNavigate,
  onLaunch,
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
      <div className="max-w-[1680px] mx-auto px-4 md:px-6 py-10 md:py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-8 mb-10">
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
              Free trading journal for active traders. Track performance on a P&L calendar — broker sync or manual entry.
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
                <a
                  href="/app"
                  onClick={navHandler(onLaunch)}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Open journal
                </a>
              </li>
              <li>
                <a
                  href="/guides"
                  onClick={navHandler(onGuides)}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Guides
                </a>
              </li>
              <li>
                <a href="/#faq" onClick={goHomeSection('#faq')} className="hover:text-emerald-400 transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-3">Company</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a
                  href="/help-center"
                  onClick={navHandler(onNavigate && (() => onNavigate('help-center')))}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Help Center
                </a>
              </li>
              <li>
                <a
                  href="/whats-new"
                  onClick={navHandler(onNavigate && (() => onNavigate('whats-new')))}
                  className="hover:text-emerald-400 transition-colors"
                >
                  What&apos;s New
                </a>
              </li>
              <li>
                <a
                  href="/pricing"
                  onClick={navHandler(onNavigate && (() => onNavigate('pricing')))}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="/#security"
                  onClick={goHomeSection('#security')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Security
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
              {BROKER_GUIDES.map((guide) => (
                <li key={guide.slug}>
                  <a
                    href={guide.path}
                    /* Left as a plain link on purpose: these are crawlable SEO landing pages and
                       no page above the footer carries a broker-guide nav handler to pass down. */
                    className="hover:text-emerald-400 transition-colors"
                  >
                    {guide.brokerName} journal guide
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
                <a href="mailto:support@trendchasers.net" className="hover:text-emerald-400 transition-colors">
                  support@trendchasers.net
                </a>
              </li>
              <li>
                <a
                  href="/report-bug"
                  onClick={navHandler(onNavigate && (() => onNavigate('report-bug')))}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Report a bug
                </a>
              </li>
              <li>
                <a
                  href="/request-broker"
                  onClick={navHandler(onNavigate && (() => onNavigate('request-broker')))}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Request broker support
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
  onNavigate?: (route: ExtraNavRoute) => void;
  showBrokersLink?: boolean;
}

function NavBrand({ onHome }: { onHome?: () => void }) {
  const logo = (
    <img src="/nav-logo.png" alt="Trend Chasers" className="h-14 sm:h-24 w-auto object-contain" />
  );
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

export function LandingNav({
  onLaunch,
  onHome,
  onBrokers,
  onGuides,
  onNavigate,
  showBrokersLink = true,
}: LandingNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="relative z-30 border-b border-border/50 backdrop-blur-md bg-bg-primary/70 sticky top-0">
      <div className="max-w-[1680px] mx-auto px-4 md:px-8 h-24 sm:h-32 flex items-center gap-3 sm:gap-6 md:gap-10">
        <NavBrand onHome={onHome} />
        <nav className="hidden sm:flex items-center gap-6 sm:gap-8" aria-label="Main">
          <ProductsDropdown onLaunch={onLaunch} onNavigate={onNavigate} />
          <a
            href="/guides"
            onClick={(e) => {
              if (onGuides) {
                e.preventDefault();
                onGuides();
              }
            }}
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Tutorials
          </a>
          {showBrokersLink && (
            <a
              href="/brokers"
              onClick={(e) => {
                if (onBrokers) {
                  e.preventDefault();
                  onBrokers();
                }
              }}
              className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Brokers
            </a>
          )}
          <a
            href="/help-center"
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate('help-center');
              }
            }}
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Help Center
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="sm:hidden p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <a
            href="/app"
            onClick={(e) => {
              e.preventDefault();
              onLaunch();
            }}
            className="btn-primary text-sm px-4 sm:px-5 py-2.5 shrink-0"
          >
            {/* Shorter on narrow phones so it doesn't crowd the logo + menu button off the edge —
                the auth modal it opens lets you switch between signing up and signing in either way. */}
            <span className="sm:hidden">Sign in</span>
            <span className="hidden sm:inline">Sign up / Sign in</span>
          </a>
        </div>
      </div>

      <MobileNavPanel
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onLaunch={onLaunch}
        onGuides={onGuides}
        onBrokers={onBrokers}
        onNavigate={onNavigate}
        showBrokersLink={showBrokersLink}
      />
    </header>
  );
}
