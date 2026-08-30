import { useEffect, useMemo, useState } from 'react';
import { LifeBuoy, Search } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import {
  fetchPublishedHelpArticles,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpArticleCategory,
} from '../services/adminHelpArticles';
import type { ExtraNavRoute } from '../hooks/useRoute';
import { SupportLinks } from '../components/support/SupportLinks';

interface HelpCenterPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onReportBug?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

type CategoryFilter = 'all' | HelpArticleCategory;

/** A short all-caps line on its own is a section heading, not a shouted sentence. */
function isHeading(block: string): boolean {
  return (
    block.length <= 48
    && !block.includes('\n')
    && block === block.toUpperCase()
    && /[A-Z]/.test(block)
  );
}

/**
 * Article body is stored as plain text — blank lines separate paragraphs.
 *
 * Longer articles need structure, and the editor is a plain textarea, so the one convention it
 * supports is a short line in capitals standing alone. Rendering those as headings is what lets a
 * 3,000-word walkthrough be skimmed instead of read start to finish.
 */
function ArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="px-5 pb-5 space-y-3">
      {blocks.map((block, i) =>
        isHeading(block) ? (
          <h4
            key={i}
            className="text-[11px] font-semibold uppercase tracking-wider text-accent/90 pt-2 first:pt-0"
          >
            {block}
          </h4>
        ) : (
          <p key={i} className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {block}
          </p>
        ),
      )}
    </div>
  );
}

function ArticleRow({ article }: { article: HelpArticle }) {
  return (
    <details className="glass-card rounded-xl group">
      <summary className="px-5 py-4 cursor-pointer font-medium text-sm md:text-base list-none flex items-center justify-between gap-4">
        {article.title}
        <span className="text-text-secondary group-open:rotate-45 transition-transform text-lg shrink-0">+</span>
      </summary>
      <ArticleBody body={article.body} />
    </details>
  );
}

export function HelpCenterPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onReportBug,
  onNavigate,
}: HelpCenterPageProps) {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchPublishedHelpArticles().then((list) => {
      if (!cancelled) {
        setArticles(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const countByCategory = useMemo(() => {
    const counts = new Map<HelpArticleCategory, number>();
    for (const a of articles) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    return counts;
  }, [articles]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return articles.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (term && !a.title.toLowerCase().includes(term) && !a.body.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [articles, category, search]);

  const grouped = useMemo(() => {
    if (category !== 'all') return [{ category, items: filtered }] as { category: CategoryFilter; items: HelpArticle[] }[];
    const byCategory = new Map<HelpArticleCategory, HelpArticle[]>();
    for (const a of filtered) {
      const list = byCategory.get(a.category) ?? [];
      list.push(a);
      byCategory.set(a.category, list);
    }
    return HELP_CATEGORIES.filter((c) => byCategory.has(c.key)).map((c) => ({
      category: c.key as CategoryFilter,
      items: byCategory.get(c.key) ?? [],
    }));
  }, [filtered, category]);

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav
        onLaunch={onLaunch}
        onHome={onHome}
        onBrokers={onBrokers}
        onGuides={onGuides}
        onNavigate={onNavigate}
      />

      <main className="relative z-10 flex-1 max-w-[1680px] mx-auto px-4 md:px-8 py-12 md:py-16 w-full">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onHome();
          }}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8"
        >
          <span aria-hidden>←</span> Back to home
        </a>

        <div className="flex items-center gap-2 mb-2">
          <LifeBuoy className="h-6 w-6 text-emerald-400" aria-hidden />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Help Center</h1>
        </div>
        <p className="text-base text-text-secondary mb-8 leading-relaxed max-w-xl">
          Answers and how-tos, organized by area. Can&apos;t find what you need? Reach us through
          Report a bug or Request broker support in the footer.
        </p>

        {/* Controls that cannot do anything are worse than no controls: a search box over an
            empty library and a filter over zero categories both make a new Help Center read as a
            broken one. They appear with the first article. */}
        {articles.length > 0 && (
        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the Help Center"
            className="input-field text-sm w-full pl-10"
            aria-label="Search help articles"
          />
        </div>
        )}

        <div className={articles.length > 0 ? 'grid md:grid-cols-[200px_1fr] gap-8' : ''}>
          {articles.length > 0 && (
          <nav aria-label="Help Center categories" className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`shrink-0 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                category === 'all'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
              }`}
            >
              All articles
              <span className="ml-1.5 opacity-70">({articles.length})</span>
            </button>
            {/* A sidebar of eight categories all reading (0) is what made an empty Help Center
                look broken rather than new. Only categories with something in them are offered. */}
            {HELP_CATEGORIES.filter((c) => (countByCategory.get(c.key) ?? 0) > 0).map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`shrink-0 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  category === c.key
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
                }`}
              >
                {c.label}
                <span className="ml-1.5 opacity-70">({countByCategory.get(c.key) ?? 0})</span>
              </button>
            ))}
          </nav>
          )}

          <div className="min-w-0">
            {loading ? (
              <p className="text-sm text-text-secondary">Loading articles…</p>
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-bg-secondary/40 p-8 text-center">
                <p className="text-sm text-text-primary font-medium mb-1.5">
                  {search.trim() ? `Nothing here for “${search.trim()}”` : 'No articles here yet'}
                </p>
                <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
                  {search.trim()
                    ? 'Try a different word, or take a look at the tutorials and broker guides below.'
                    : 'The tutorials and broker guides below cover most of what people ask — and if your question is not in them, tell us.'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {grouped.map((group) => (
                  <div key={group.category}>
                    {category === 'all' && (
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
                        {HELP_CATEGORIES.find((c) => c.key === group.category)?.label}
                      </h2>
                    )}
                    <div className="space-y-3">
                      {group.items.map((article) => (
                        <ArticleRow key={article.id} article={article} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-12">
          <SupportLinks
            current="help"
            onGuides={onGuides}
            onBrokers={onBrokers}
            onReportBug={onReportBug}
          />
        </div>
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}
