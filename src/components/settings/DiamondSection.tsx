import { useEffect, useState } from 'react';
import { Gem, Loader2, Mail, ShieldAlert, Trash2, Zap } from 'lucide-react';
import { TIER_PLANS, lowestTierWith } from '../../config/tiers';
import { useEntitlement } from '../../context/useEntitlement';
import { useSettings } from '../../context/useSettings';
import { goToPricing } from '../../utils/navigateToPath';
import { fetchSeat, inviteCoach, revokeCoach, type SeatSummary } from '../../services/coachSeat';

/**
 * The settings for the things the top plan actually buys.
 *
 * Grouped rather than scattered among Display and Setup tags, because they are the answer to
 * "what am I paying the extra twenty dollars for", and that answer should be somewhere a person
 * can look at it. Shown to everybody and locked for everybody else: a plan's features listed on a
 * pricing page and invisible inside the product are features nobody upgrades for.
 */
function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  label: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-border/50 p-3 ${
        disabled ? 'opacity-50' : 'cursor-pointer hover:border-accent/30 transition-colors'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="text-accent/80">{icon}</span>
          {label}
        </span>
        <span className="block text-xs text-text-secondary leading-relaxed mt-0.5">{hint}</span>
      </span>
    </label>
  );
}

export function DiamondSection() {
  const { settings, updateSettings } = useSettings();
  const { has, loaded } = useEntitlement();
  const entitled = has('coachSeat');

  const [seat, setSeat] = useState<SeatSummary | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entitled) return;
    let cancelled = false;
    void fetchSeat()
      .then((s) => {
        if (!cancelled) setSeat(s);
      })
      .catch(() => {
        // A seat that cannot be read is shown as none. The invite form still works, and a failed
        // read is not worth an error the trader can do nothing about.
      });
    return () => {
      cancelled = true;
    };
  }, [entitled]);

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await inviteCoach(email);
      setSeat({
        state: result.state,
        coachEmail: result.coachEmail,
        invitedAt: new Date().toISOString(),
        acceptedAt: null,
      });
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that invitation.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await revokeCoach();
      setSeat({ state: 'none', coachEmail: null, invitedAt: null, acceptedAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your coach.');
    } finally {
      setBusy(false);
    }
  };

  const needed = lowestTierWith('coachSeat');
  const planName = needed ? TIER_PLANS[needed].name : 'the top plan';

  return (
    <section className="panel-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          <Gem size={14} className="text-sky-300" />
          {planName} features
        </h2>
        {loaded && !entitled && (
          <button
            type="button"
            onClick={goToPricing}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors focus-ring rounded"
          >
            Upgrade
          </button>
        )}
      </div>

      {loaded && !entitled && (
        <p className="text-xs text-text-secondary leading-relaxed">
          These are part of {planName}. They stay switched off until then — nothing here is running
          on your account.
        </p>
      )}

      <div className="space-y-2">
        <Toggle
          icon={<Zap size={13} />}
          label="Import my trades automatically"
          hint="Every market morning, before you open the app. Your sync allowance is untouched — this does not spend one."
          checked={settings.autoSyncEnabled}
          disabled={!entitled}
          onChange={(autoSyncEnabled) => updateSettings({ autoSyncEnabled })}
        />
        <Toggle
          icon={<ShieldAlert size={13} />}
          label="Tell me when I break my own rules"
          hint="A banner the moment a limit goes, and an email the next morning if one did. The limits themselves are under Trading rules."
          checked={settings.ruleAlertsEnabled}
          disabled={!entitled}
          onChange={(ruleAlertsEnabled) => updateSettings({ ruleAlertsEnabled })}
        />
      </div>

      <div className="rounded-lg border border-border/50 p-3 space-y-2.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Mail size={13} className="text-accent/80" />
          Your coach
        </p>
        <p className="text-xs text-text-secondary leading-relaxed">
          Invite one person to read the last 90 days of your journal and leave notes on it. They
          need a free Trend Chasers account on the same address — they do not need a paid plan.
        </p>

        {seat && seat.state !== 'none' ? (
          <div className="flex items-center gap-2 rounded-lg bg-bg-primary/50 px-2.5 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium truncate">{seat.coachEmail}</span>
              <span className="block text-[11px] text-text-secondary">
                {seat.state === 'active'
                  ? 'Has access to your journal'
                  : 'Invited — access starts when they sign in'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void revoke()}
              disabled={busy || !entitled}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-loss-bright transition-colors focus-ring rounded px-1.5 py-1 disabled:opacity-50"
            >
              <Trash2 size={12} />
              Remove
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void invite();
            }}
            className="flex gap-2"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@example.com"
              disabled={!entitled || busy}
              aria-label="Your coach's email address"
              className="input-field flex-1 text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!entitled || busy || !email.trim()}
              className="btn-secondary px-4 py-2 text-sm shrink-0 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Invite'}
            </button>
          </form>
        )}

        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
