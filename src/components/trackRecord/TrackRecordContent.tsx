import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Check, Copy, ExternalLink } from 'lucide-react';
import type { Trade } from '../../types';
import { useAuth } from '../../context/useAuth';
import {
  buildTrackRecord,
  canPublish,
  MIN_TRADES_TO_PUBLISH,
  type PublishedRecord,
} from '../../utils/trackRecord';
import { fetchPublishedRecord, publishRecord, unpublishRecord } from '../../services/trackRecord';
import { formatCurrency } from '../../utils/format';
import { reportErrorSilently } from '../../services/errorReporting';

interface TrackRecordContentProps {
  /** Every trade on the account, across journals — a record spans the trader, not one journal. */
  trades: Trade[];
  onBack: () => void;
}

function Toggle({
  checked,
  onChange,
  label,
  blurb,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  blurb: string;
}) {
  return (
    <label className="flex gap-3 items-start cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500 focus-ring rounded"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-text-secondary mt-0.5 leading-relaxed">{blurb}</span>
      </span>
    </label>
  );
}

/**
 * Publishing a record, and taking it down.
 *
 * The preview here is computed by the same buildTrackRecord the server runs, so what the trader
 * sees before pressing publish is what the page will say afterwards. It is a preview and not the
 * source of the published figures — the server recomputes from its own read of the trades, because
 * a browser that can post the numbers makes the tick on the page meaningless.
 */
export function TrackRecordContent({ trades, onBack }: TrackRecordContentProps) {
  const { username } = useAuth();

  const record = useMemo(() => buildTrackRecord(trades), [trades]);
  const eligible = canPublish(record);

  /* Stamped with the username it was read for, so "loading" is derived rather than set inside
     the effect — and a reply that arrives after a rename is ignored rather than rendered under
     the new name. */
  const [loaded, setLoaded] = useState<{ forUser: string; record: PublishedRecord | null } | null>(
    null,
  );
  const [showAmounts, setShowAmounts] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* Bumped after publishing or taking down, to re-read what is actually live rather than
     assuming the write landed the way the screen expects. */
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    fetchPublishedRecord(username)
      .then((found) => {
        if (cancelled) return;
        setLoaded({ forUser: username, record: found });
        if (found) {
          // Opens on the choices already in force, so republishing after adding trades does
          // not silently flip a trader who chose privacy back to showing amounts.
          setShowAmounts(found.showAmounts);
          setAnonymous(found.username === null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        reportErrorSilently(err, 'promise', 'trackRecord.refresh');
        setError('Could not check whether you have a page. Refresh to try again.');
        setLoaded({ forUser: username, record: null });
      });

    return () => {
      cancelled = true;
    };
  }, [username, reload]);

  const live = loaded?.forUser === username ? loaded.record : null;
  const loading = Boolean(username) && loaded?.forUser !== username;

  const url = username ? `https://trendchasers.net/r/${username.toLowerCase()}` : '';

  const run = async (action: 'publish' | 'unpublish') => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'publish') await publishRecord({ showAmounts, anonymous });
      else await unpublishRecord();
      // Cleared first so the screen says "checking" rather than showing the state it just
      // replaced — after a take-down that would be a "Published" badge over a deleted page.
      setLoaded(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch((err: unknown) => reportErrorSilently(err, 'promise', 'trackRecord.copy'));
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors focus-ring rounded-lg px-1 py-1"
      >
        <ArrowLeft size={16} />
        Back to dashboard
      </button>

      <div>
        <h1 className="text-2xl font-bold">Verified track record</h1>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          A public page built only from trades your broker sent us. Anything you typed in by hand is
          left out of it — and the page says how many.
        </p>
      </div>

      <section className="hero-card p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-text-secondary font-semibold">
          What your page would say
        </p>

        <div className="flex flex-wrap items-end gap-x-10 gap-y-4 mt-3">
          <div>
            <p className="text-xs text-text-secondary">Broker-verified trades</p>
            <p className="text-3xl md:text-4xl font-extrabold tabular-nums leading-none mt-1">
              {record.verifiedTrades.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Hand-entered, excluded</p>
            <p className="text-3xl md:text-4xl font-extrabold tabular-nums leading-none mt-1 text-text-secondary">
              {record.excludedTrades.toLocaleString()}
            </p>
          </div>
          {record.verifiedTrades > 0 && (
            <div>
              <p className="text-xs text-text-secondary">Win rate</p>
              <p className="text-3xl md:text-4xl font-extrabold tabular-nums leading-none mt-1">
                {record.winRate.toFixed(1)}%
              </p>
            </div>
          )}
          {record.verifiedTrades > 0 && showAmounts && (
            <div>
              <p className="text-xs text-text-secondary">Net P&amp;L</p>
              <p
                className={`text-3xl md:text-4xl font-extrabold tabular-nums leading-none mt-1 ${
                  record.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {formatCurrency(record.netPnl)}
              </p>
            </div>
          )}
        </div>

        {!eligible && (
          /*
           * Stated with the number, not as a bare refusal. Thirty trades is a product judgement
           * about what deserves the word "verified" on a public page, and somebody who is told
           * "you have 12 of 30" can act on it; somebody told "not eligible" cannot.
           */
          <p className="text-xs text-amber-300/90 mt-4 leading-relaxed">
            You need {MIN_TRADES_TO_PUBLISH} broker-imported trades to publish — you have{' '}
            {record.verifiedTrades}. A fortnight of trades under the word &ldquo;verified&rdquo;
            reads as a claim it cannot support, so the floor is there on purpose.
            {record.excludedTrades > 0 &&
              ' Hand-entered trades do not count towards it, and never appear on the page.'}
          </p>
        )}
      </section>

      <section className="panel-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          What to show
        </h2>

        <div className="space-y-4 mt-4">
          <Toggle
            checked={showAmounts}
            onChange={setShowAmounts}
            label="Show dollar amounts"
            blurb="Off, the page shows win rate and profit factor only. The amounts are not hidden by the page — they are never written to it, so nobody can read them out of it."
          />
          <Toggle
            checked={anonymous}
            onChange={setAnonymous}
            label="Publish without my name"
            blurb="The page still lives at your username's address, so anyone you send it to can reach it, but your name is not printed on it."
          />
        </div>

        {/*
          Said here rather than discovered later. There is no percentage return on the page and
          there never will be, and somebody about to publish is exactly who wants to know why.
        */}
        <p className="text-xs text-text-secondary mt-5 leading-relaxed">
          There is no percentage return on the page. A broker connection is read-only and never
          shows us your balance, so a percentage would be a real profit divided by a number you
          typed — which looks audited and is not.
        </p>
      </section>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <section className="panel-card border-emerald-500/25 p-5">
        {loading ? (
          <p className="text-sm text-text-secondary">Checking whether you have a page…</p>
        ) : !username ? (
          <p className="text-sm text-text-secondary leading-relaxed">
            Pick a username in Account settings first — it becomes the address of your page.
          </p>
        ) : live ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              Published
            </span>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <code className="text-sm text-text-primary break-all">{url}</code>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors focus-ring rounded-lg px-2 py-1"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors focus-ring rounded-lg px-2 py-1"
              >
                <ExternalLink size={13} />
                Open
              </a>
            </div>

            <p className="text-xs text-text-secondary mt-3 leading-relaxed">
              These figures were taken {new Date(live.updatedAt).toLocaleString()} and do not update
              on their own. Republish after syncing to bring the page up to date.
            </p>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => void run('publish')}
                disabled={busy || !eligible}
                className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Republish with these settings'}
              </button>
              <button
                type="button"
                onClick={() => void run('unpublish')}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:text-red-400 hover:border-red-500/40 transition-colors focus-ring disabled:opacity-50"
              >
                Take it down
              </button>
            </div>

            {/* What "take it down" actually does, because the usual meaning of unpublish — a flag
                flipped on a document anyone can still read — is not what happens here. */}
            <p className="text-[11px] text-text-secondary mt-3">
              Taking it down deletes the page and its figures outright. The address stops working
              for everyone, including anyone who saved the link.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Publish
            </h2>
            <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
              Your page will live at{' '}
              <code className="text-text-primary break-all">{url}</code>. You can take it down at any
              time.
            </p>
            <button
              type="button"
              onClick={() => void run('publish')}
              disabled={busy || !eligible}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold mt-4 disabled:opacity-50"
            >
              <BadgeCheck size={15} />
              {busy ? 'Publishing…' : 'Publish my record'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
