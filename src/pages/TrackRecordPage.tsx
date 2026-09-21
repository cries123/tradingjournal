import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BadgeCheck, Lock, ShieldQuestion } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import type { ExtraNavRoute } from '../hooks/useRoute';
import { fetchPublishedRecord } from '../services/trackRecord';
import type { PublishedRecord } from '../utils/trackRecord';
import { formatCurrency, parseDateKey } from '../utils/format';
import { reportErrorSilently } from '../services/errorReporting';

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

/** "3 Feb 2026", from a YYYY-MM-DD key, in local time — parseDateKey rather than new Date(key). */
function longDate(key: string | null): string {
  if (!key) return '—';
  return parseDateKey(key).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function Figure({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
}) {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none mt-1.5 ${tone ?? ''}`}>{value}</p>
      {note && <p className="text-[11px] text-text-secondary mt-1.5">{note}</p>}
    </div>
  );
}

/** A labelled band within the one page. Not a card — a rule is what separates the sections. */
function Band({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t pt-6 mt-6 border-border/60 ${className}`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The record itself, with no fetching in it.
 *
 * Separate from the page so the markup can be rendered from a record object alone — by a test, or
 * by the offline preview used to check layout. The page below owns loading, missing and failed;
 * this owns only what a record looks like.
 *
 * ONE PAGE, not a stack of cards. The figures, the exclusions, the limits and the stamp are one
 * argument, and a reader who takes the numbers off the top and stops before the caveats has read
 * something we did not write. Bands separated by rules keep it readable without letting any part
 * of it look like a self-contained tile.
 *
 * THE HANDLE, NEVER A REAL NAME. The page is headed by the trader’s username — a name they
 * chose, which is already the address of the page and which they can change. What must never
 * appear is the displayName Firebase takes from a Google sign-in, which is somebody’s legal
 * name: it is not written to the published document at all, so it cannot arrive here by
 * accident or by a later edit.
 */
export function PublishedRecordView({
  record,
  onLaunch,
}: {
  record: PublishedRecord;
  onLaunch: () => void;
}) {
  const amounts = record.showAmounts === true;

  return (
    <article className="panel-card p-5 md:p-8">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
        Broker verified
      </span>

      <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-4">
        {record.username}&rsquo;s verified trading record
      </h1>

      {/*
        The sentence the whole page rests on, and it is first. Every figure below came from trades a
        brokerage sent us over a read-only connection; the ones that were typed in are counted here
        and then left out of everything else.
      */}
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">
        Built from{' '}
        <strong className="text-text-primary tabular-nums">
          {record.verifiedTrades.toLocaleString()}
        </strong>{' '}
        trades imported directly from a connected brokerage
        {record.brokers.length > 0 ? ` (${record.brokers.join(', ')})` : ''}.{' '}
        {record.excludedTrades > 0 ? (
          <>
            <strong className="text-text-primary tabular-nums">
              {record.excludedTrades.toLocaleString()}
            </strong>{' '}
            hand-entered {record.excludedTrades === 1 ? 'trade was' : 'trades were'} excluded.
          </>
        ) : (
          'No hand-entered trades were excluded, because there were none.'
        )}
      </p>

      <p className="text-xs text-text-secondary mt-3">
        {longDate(record.firstDate)} – {longDate(record.lastDate)} ·{' '}
        {record.tradingDays.toLocaleString()} trading{' '}
        {record.tradingDays === 1 ? 'day' : 'days'}
      </p>

      <Band title="The numbers">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          <Figure label="Win rate" value={`${record.winRate.toFixed(1)}%`} />
          <Figure
            label="Profit factor"
            value={record.profitFactor.toFixed(2)}
            note="Gross wins ÷ gross losses"
          />
          <Figure label="Trades" value={record.verifiedTrades.toLocaleString()} />

          {/*
            Rendered only when the document actually carries them. A trader who published without
            amounts has no money fields in their document at all, so there is nothing here to leak
            and nothing to accidentally print as $0.
          */}
          {amounts && record.netPnl !== undefined && (
            <Figure
              label="Net P&L"
              value={formatCurrency(record.netPnl)}
              tone={record.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
          )}
          {amounts && record.avgWin !== undefined && (
            <Figure label="Average win" value={formatCurrency(record.avgWin)} tone="text-emerald-400" />
          )}
          {amounts && record.avgLoss !== undefined && (
            <Figure label="Average loss" value={formatCurrency(record.avgLoss)} tone="text-red-400" />
          )}
          {amounts && record.bestDay !== undefined && (
            <Figure label="Best day" value={formatCurrency(record.bestDay)} tone="text-emerald-400" />
          )}
          {amounts && record.worstDay !== undefined && (
            <Figure label="Worst day" value={formatCurrency(record.worstDay)} tone="text-red-400" />
          )}
          {amounts && record.maxDrawdown !== undefined && (
            <Figure
              label="Max drawdown"
              value={formatCurrency(record.maxDrawdown)}
              tone="text-red-400"
              note="Largest peak-to-trough fall, by day"
            />
          )}
        </div>

        {!amounts && (
          <p className="text-xs text-text-secondary mt-5 leading-relaxed">
            This record shows rates only. The dollar amounts were never written to this page.
          </p>
        )}
      </Band>

      {record.journalsIncluded < record.journalsEligible && (
        <p className="text-xs text-amber-300/90 mt-4 leading-relaxed">
          Covers {record.journalsIncluded} of this trader&rsquo;s {record.journalsEligible}{' '}
          broker-connected accounts. The rest are not in any figure here.
        </p>
      )}

      {/*
        The seal, and every line of it is a claim we can stand behind.

        Not "audited": nobody audits these, and an audited track record is a specific regulated
        thing in performance advertising — the first word a sceptic tests, and the page collapses
        when it fails. Not "cannot be manipulated" either, because the trader chooses which
        accounts to connect and which journals to include.

        What IS true is narrower and harder to argue with: the figures are computed here from
        broker-imported data, and there is no path by which a browser can write them. That is not a
        promise, it is what firestore.rules enforces — every client write to this collection is
        denied, and the only writer is a server function that recomputes from the trades.
      */}
      <Band title="Stamped and verified by Trend Chasers" className="border-emerald-500/30">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="shrink-0 flex sm:block justify-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
              <BadgeCheck className="h-8 w-8" aria-hidden />
            </span>
          </div>

          <div className="min-w-0">
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li className="flex gap-2 items-start">
                <Lock className="h-3.5 w-3.5 mt-1 shrink-0 text-emerald-400" aria-hidden />
                <span>
                  <strong className="text-text-primary">The trader cannot edit these figures.</strong>{' '}
                  They are computed by Trend Chasers from the imported trades. There is no way to
                  submit a number to this page from a browser, and every attempt to write one is
                  refused by the database itself.
                </span>
              </li>
              <li className="flex gap-2 items-start">
                <Lock className="h-3.5 w-3.5 mt-1 shrink-0 text-emerald-400" aria-hidden />
                <span>
                  <strong className="text-text-primary">
                    Every trade came from a read-only brokerage connection.
                  </strong>{' '}
                  Not typed in, not uploaded. Anything hand-entered is excluded from all of it and
                  counted on this page.
                </span>
              </li>
            </ul>

            {/* The handle, not a legal name — the same string that is already in the URL. */}
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-secondary mt-4">
              Stamped{' '}
              {new Date(record.updatedAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}{' '}
              · {record.username} · trendchasers.net
            </p>
          </div>
        </div>
      </Band>

      <Band title="Trend Chasers">
        <p className="text-sm text-text-secondary leading-relaxed">
          Trend Chasers is a trading journal that imports your fills from your broker. If you want a
          page like this one, it starts with connecting an account.
        </p>
        <button type="button" onClick={onLaunch} className="btn-primary text-sm px-6 py-2.5 mt-4">
          Start your own journal
        </button>
      </Band>
    </article>
  );
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
