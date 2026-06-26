import { BrandLogo } from '../components/BrandLogo';
import { DashboardPreview } from '../components/landing/DashboardPreview';

interface LandingPageProps {
  onLaunch: () => void;
}

const FEATURES = [
  {
    icon: '📅',
    title: 'P&L Calendar',
    description:
      'See your month at a glance — green days for profit, red for loss. Click any day to import trades or review performance.',
  },
  {
    icon: '📄',
    title: 'Schwab CSV Import',
    description:
      'Upload your account statement export. Round-trip trades are matched automatically so you can review and import in seconds.',
  },
  {
    icon: '📷',
    title: 'Screenshot AI Import',
    description:
      'Snap your Thinkorswim position screen. AI reads P/L Day, contract details, and Greeks — then lets you pick what to log.',
  },
  {
    icon: '✏️',
    title: 'Manual Trade Entry',
    description:
      'Log trades by hand with symbol, P/L, side, setup tags, and notes. Perfect for quick entries between sessions.',
  },
  {
    icon: '📊',
    title: 'Performance Analytics',
    description:
      'Net P&L, win rate, profit factor, avg profit per trade & day, weekday breakdown, and daily gross charts.',
  },
  {
    icon: '☁️',
    title: 'Firebase Cloud Sync',
    description:
      'Sign in with Google or email. Your journal syncs to Firestore and follows you across devices — with local backup.',
  },
];

const STEPS = [
  { n: '01', title: 'Import or log trades', body: 'CSV, screenshot, or manual — get data in however you trade.' },
  { n: '02', title: 'Review your calendar', body: 'Daily P&L colors show winning and losing sessions instantly.' },
  { n: '03', title: 'Analyze and improve', body: 'Stats and charts reveal patterns in your weekday and trade performance.' },
];

export function LandingPage({ onLaunch }: LandingPageProps) {
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />

      {/* Nav */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-md bg-bg-primary/70 sticky top-0">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <BrandLogo size="md" />
          <button type="button" onClick={onLaunch} className="btn-primary text-sm px-5 py-2.5">
            Open Journal
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-16 md:pb-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Built for Thinkorswim & Schwab traders
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold leading-[1.1] tracking-tight">
              Your trading journal,{' '}
              <span className="text-gradient">beautifully organized</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-xl">
              Track daily P&L on a visual calendar, import trades from CSV or screenshots with AI,
              and analyze win rate, profit factor, and more — all in one professional dashboard.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={onLaunch} className="btn-primary text-base px-7 py-3.5">
                Start journaling free
              </button>
              <a href="#features" className="btn-secondary text-base px-7 py-3.5 text-center">
                See all features
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-text-secondary">
              <span className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> No spreadsheet required
              </span>
              <span className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Works on mobile & desktop
              </span>
              <span className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Cloud sync optional
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/20 rounded-3xl blur-2xl" />
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 border-t border-border/50 bg-bg-secondary/30 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Features</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to review your edge</h2>
            <p className="mt-4 text-text-secondary">
              From import to analysis — designed around how active traders actually work.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {FEATURES.map((f) => (
              <article key={f.title} className="glass-card rounded-xl p-5 md:p-6 hover:border-emerald-500/30 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-bg-primary/80 border border-border/60 flex items-center justify-center text-lg mb-4 group-hover:scale-105 transition-transform">
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs uppercase tracking-widest text-cyan-400 font-medium mb-3">Workflow</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Three steps to clarity</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.n} className="relative glass-card rounded-xl p-6 md:p-7">
                <span className="text-4xl font-bold text-gradient opacity-80">{step.n}</span>
                <h3 className="text-lg font-semibold mt-3 mb-2">{step.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-border/50 py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Ready to track your edge?</h2>
          <p className="mt-4 text-text-secondary text-base md:text-lg">
            Open your journal, import this month&apos;s trades, and see your performance on the calendar.
          </p>
          <button type="button" onClick={onLaunch} className="btn-primary text-base px-8 py-3.5 mt-8">
            Open Trading Journal
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo size="sm" />
          <p className="text-xs text-text-secondary">© {new Date().getFullYear()} Trading Journal · Trade smarter</p>
        </div>
      </footer>
    </div>
  );
}
