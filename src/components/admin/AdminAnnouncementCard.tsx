import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import {
  EMPTY_ANNOUNCEMENT,
  fetchAnnouncement,
  saveAnnouncement,
  type Announcement,
  type AnnouncementCta,
  type AnnouncementTone,
} from '../../services/announcement';
import { SiteAnnouncement } from '../SiteAnnouncement';
import { AnnouncementBar } from '../landing/AnnouncementBar';

const TONES: { id: AnnouncementTone; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'success', label: 'Good news' },
  { id: 'warning', label: 'Heads up' },
];

const CTAS: { id: AnnouncementCta; label: string }[] = [
  { id: 'none', label: 'No button' },
  { id: 'connect-broker', label: 'Connect broker' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'help-center', label: 'Help Center' },
  { id: 'whats-new', label: "What's New" },
  { id: 'url', label: 'A link…' },
];

interface AdminAnnouncementCardProps {
  onAudit: (detail: string) => void;
}

/**
 * Writes the banner every user sees at the top of their dashboard.
 *
 * Saving always bumps the revision, which un-dismisses it for everyone. That's deliberate and
 * worth knowing before you fix a typo at 2pm: the fix is a new banner as far as every browser is
 * concerned, and people who had closed the old one will see it again.
 */
export function AdminAnnouncementCard({ onAudit }: AdminAnnouncementCardProps) {
  const [saved, setSaved] = useState<Announcement>(EMPTY_ANNOUNCEMENT);
  const [draft, setDraft] = useState<Announcement>(EMPTY_ANNOUNCEMENT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // fresh: the admin must see what's actually stored, not a five-minute-old cache of it.
    void fetchAnnouncement({ fresh: true })
      .then((a) => {
        if (cancelled) return;
        setSaved(a);
        setDraft(a);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof Announcement>(key: K, value: Announcement[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = JSON.stringify({ ...draft, revision: 0, updatedAt: '' }) !==
    JSON.stringify({ ...saved, revision: 0, updatedAt: '' });

  const save = async () => {
    if (!draft.title.trim()) {
      setError('Give it a headline — that line is the only part everyone reads.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await saveAnnouncement(
        {
          enabled: draft.enabled,
          title: draft.title.trim(),
          body: draft.body.trim(),
          bodyShort: draft.bodyShort.trim(),
          tone: draft.tone,
          cta: draft.cta,
          ctaLabel: draft.ctaLabel.trim(),
          ctaUrl: draft.ctaUrl.trim(),
        },
        saved.revision,
      );
      setSaved(next);
      setDraft(next);
      setMessage(
        next.enabled
          ? 'Published. Anyone who dismissed the last one will see this within five minutes.'
          : 'Saved and switched off — nobody is seeing a banner right now.',
      );
      onAudit(next.enabled ? `Published announcement: ${next.title}` : 'Turned the announcement off');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the announcement');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full input-field text-sm';
  const label = 'text-xs text-text-secondary mb-1.5 block';

  return (
    <div className="glass-card rounded-xl p-5 md:p-6 mb-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-text-primary">Site announcement</h2>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
            className="rounded border-border accent-emerald-500"
          />
          Show it
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={label} htmlFor="ann-title">
              Headline
            </label>
            <input
              id="ann-title"
              className={field}
              value={draft.title}
              maxLength={80}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Plans are live"
            />
          </div>

          <div>
            <label className={label} htmlFor="ann-body">
              Message — shown on desktop
            </label>
            <textarea
              id="ann-body"
              className={`${field} min-h-[80px] resize-y`}
              value={draft.body}
              maxLength={400}
              onChange={(e) => set('body', e.target.value)}
              placeholder="What changed, and what it means for them."
            />
          </div>

          <div>
            <label className={label} htmlFor="ann-short">
              Short version — shown on phones (optional)
            </label>
            <input
              id="ann-short"
              className={field}
              value={draft.bodyShort}
              maxLength={140}
              onChange={(e) => set('bodyShort', e.target.value)}
              placeholder="Falls back to the full message if you leave this empty."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="ann-tone">
                Colour
              </label>
              <select
                id="ann-tone"
                className={field}
                value={draft.tone}
                onChange={(e) => set('tone', e.target.value as AnnouncementTone)}
              >
                {TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="ann-cta">
                Button goes to
              </label>
              <select
                id="ann-cta"
                className={field}
                value={draft.cta}
                onChange={(e) => set('cta', e.target.value as AnnouncementCta)}
              >
                {CTAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {draft.cta !== 'none' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="ann-cta-label">
                  Button text
                </label>
                <input
                  id="ann-cta-label"
                  className={field}
                  value={draft.ctaLabel}
                  maxLength={40}
                  onChange={(e) => set('ctaLabel', e.target.value)}
                  placeholder="See the plans"
                />
              </div>
              {draft.cta === 'url' && (
                <div>
                  <label className={label} htmlFor="ann-cta-url">
                    Link
                  </label>
                  <input
                    id="ann-cta-url"
                    className={field}
                    value={draft.ctaUrl}
                    onChange={(e) => set('ctaUrl', e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <p className={label}>
              Preview — it appears in both places, and closing it in one closes it in both
              {!draft.enabled && (
                <span className="text-amber-300/90">
                  {' '}· not live right now, tick &ldquo;Show it&rdquo; to put it up
                </span>
              )}
            </p>
            {draft.title.trim() ? (
              <>
                <div>
                  <p className="text-[11px] text-text-secondary/70 mb-1.5">
                    Top of the public site
                  </p>
                  <div className="rounded-lg overflow-hidden border border-border/60">
                    <AnnouncementBar preview={{ ...draft, enabled: true }} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-text-secondary/70 mb-1.5">
                    Top of the journal dashboard
                  </p>
                  <SiteAnnouncement preview={{ ...draft, enabled: true }} />
                </div>
              </>
            ) : (
              <p className="text-xs text-text-secondary/70">
                Nothing to preview yet — the headline is what shows.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Publishing…' : dirty ? 'Publish' : 'No changes'}
            </button>
            {dirty && !busy && (
              <button
                type="button"
                onClick={() => setDraft(saved)}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Discard changes
              </button>
            )}
            {saved.updatedAt && (
              <span className="text-xs text-text-secondary/70">
                Version {saved.revision} · {new Date(saved.updatedAt).toLocaleString()}
              </span>
            )}
          </div>

          <p className="text-[11px] text-text-secondary/80 leading-relaxed">
            Publishing shows the banner again to everyone who had dismissed it — including for a
            small edit, since as far as their browser is concerned it&apos;s a banner they&apos;ve
            never seen. It can take up to five minutes to reach people already on the site.
          </p>

          {message && <p className="text-sm text-emerald-400">{message}</p>}
          {error && <p className="text-sm text-loss-bright">{error}</p>}
        </div>
      )}
    </div>
  );
}
