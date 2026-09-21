import { useEffect, useState } from 'react';
import { ShieldQuestion } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import type { ExtraNavRoute } from '../hooks/useRoute';
import { fetchPublishedRecord } from '../services/trackRecord';
import type { PublishedRecord } from '../utils/trackRecord';
import { reportErrorSilently } from '../services/errorReporting';
import { PublishedRecordView } from '../components/trackRecord/PublishedRecordView';

interface TrackRecordPageProps {
  slug: string;
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

/**
 * Somebody else's verified record, at /r/<username>.
 *
 * Written for a reader who does not have an account and has no reason to trust the page yet.
 */
export function TrackRecordPage({
  slug,
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: TrackRecordPageProps) {
  /*
   * Stamped with the slug it belongs to, so "loading" is DERIVED rather than set.
   *
   * Resetting to loading with a setState at the top of the effect is the pattern eslint rejects
   * here (react-hooks/set-state-in-effect), and it is also the one that briefly shows the previous
   * record's figures while the next fetch is in flight. Anything whose stamp is not the current
   * slug is simply not this page.
   */
  const [loaded, setLoaded] = useState<{
    forSlug: string;
    record: PublishedRecord | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchPublishedRecord(slug)
      .then((found) => {
        if (!cancelled) setLoaded({ forSlug: slug, record: found, failed: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        /* Told apart from "no such record" on purpose: a reader on a flaky connection should be
           asked to retry, not told the page does not exist. */
        reportErrorSilently(err, 'promise', 'trackRecord.fetch');
        setLoaded({ forSlug: slug, record: null, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const current = loaded?.forSlug === slug ? loaded : null;
  const record = current?.record ?? null;
  const state: 'loading' | 'ready' | 'missing' | 'error' = !current
    ? 'loading'
    : current.failed
      ? 'error'
      : current.record
        ? 'ready'
        : 'missing';

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

      <main className="relative z-10 flex-1 px-4 md:px-6 py-12 md:py-16">
        <div className="max-w-3xl mx-auto">
          {state === 'loading' && <p className="text-sm text-text-secondary">Loading record…</p>}

          {state === 'error' && (
            <section className="panel-card p-6 text-center">
              <h1 className="text-xl font-bold">That did not load</h1>
              <p className="text-sm text-text-secondary mt-2">
                The record could not be reached just now. Refresh the page to try again.
              </p>
            </section>
          )}

          {state === 'missing' && (
            <section className="panel-card p-6 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-text-secondary/10 text-text-secondary mb-4">
                <ShieldQuestion className="h-6 w-6" aria-hidden />
              </span>
              <h1 className="text-xl font-bold">No record here</h1>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                Nobody has published a verified record at this address, or it has been taken down.
              </p>
              <button
                type="button"
                onClick={onLaunch}
                className="btn-primary text-sm px-5 py-2.5 mt-5"
              >
                Publish your own
              </button>
            </section>
          )}

          {state === 'ready' && record && (
            <PublishedRecordView record={record} onLaunch={onLaunch} />
          )}
        </div>
      </main>

      <LandingFooter
        onPrivacy={onPrivacy}
        onTerms={onTerms}
        onHome={onHome}
        onBrokers={onBrokers}
        onGuides={onGuides}
        onNavigate={onNavigate}
        onLaunch={onLaunch}
      />
    </div>
  );
}
