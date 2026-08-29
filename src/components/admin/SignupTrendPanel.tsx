import { TrendingUp } from 'lucide-react';
import type { AdminServerStats } from '../../services/adminStats';

interface SignupTrendPanelProps {
  serverStats: AdminServerStats | null;
  serverError: string | null;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${tone ?? 'text-text-primary'}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Signups over the last 30 days, plus the headline totals.
 *
 * Sourced from Firebase Auth account-creation timestamps rather than Firestore profile docs,
 * because the two can disagree: an account whose profile write failed still signed up, and
 * counting profiles would quietly under-report exactly the users worth investigating.
 */
export function SignupTrendPanel({ serverStats, serverError }: SignupTrendPanelProps) {
  if (!serverStats) {
    return (
      <div className="glass-card rounded-xl p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold">Signups</h2>
        </div>
        <p className="text-xs text-text-secondary">
          {serverError ?? 'Set FIREBASE_SERVICE_ACCOUNT_JSON on Netlify to read signup stats.'}
        </p>
      </div>
    );
  }

  const days = serverStats.signupsByDay;
  const maxDay = Math.max(1, ...days.map((d) => d.count));
  const activeShare =
    serverStats.authUserCount > 0
      ? (serverStats.authActiveLast30Days / serverStats.authUserCount) * 100
      : 0;

  return (
    <div className="glass-card rounded-xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold">Signups</h2>
            <p className="text-[10px] text-text-secondary mt-0.5">
              From Firebase Auth account creation times
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-emerald-400">
            {serverStats.authUserCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-text-secondary">all time</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="24 hours" value={serverStats.authSignupsLast24Hours.toLocaleString()} />
        <Stat label="7 days" value={serverStats.authSignupsLast7Days.toLocaleString()} />
        <Stat label="30 days" value={serverStats.authSignupsLast30Days.toLocaleString()} />
        <Stat label="90 days" value={serverStats.authSignupsLast90Days.toLocaleString()} />
      </div>

      {days.length > 0 && (
        <div className="mt-5">
          <div className="flex items-end gap-[2px] h-16">
            {days.map((day) => (
              <div
                key={day.date}
                className="flex-1 bg-emerald-500/40 rounded-sm min-h-[2px] hover:bg-emerald-500/70 transition-colors"
                style={{ height: `${(day.count / maxDay) * 100}%` }}
                title={`${day.date}: ${day.count} signup${day.count === 1 ? '' : 's'}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-text-secondary mt-1">
            <span>30 days ago</span>
            <span>Peak {maxDay}/day</span>
            <span>Today</span>
          </div>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-3 gap-3">
        <Stat
          label="Active (30d)"
          value={`${serverStats.authActiveLast30Days.toLocaleString()} · ${activeShare.toFixed(0)}%`}
          tone="text-cyan-300"
        />
        <Stat
          label="Never signed in"
          value={serverStats.authNeverSignedIn.toLocaleString()}
          tone={serverStats.authNeverSignedIn > 0 ? 'text-amber-400' : undefined}
        />
        <Stat
          label="Missing profile"
          value={serverStats.authUsersMissingProfile.toLocaleString()}
          tone={serverStats.authUsersMissingProfile > 0 ? 'text-amber-400' : undefined}
        />
      </div>

      {serverStats.authUsersMissingProfile > 0 && (
        <p className="text-[10px] text-amber-400/80 mt-3">
          {serverStats.authUsersMissingProfile} Auth account
          {serverStats.authUsersMissingProfile === 1 ? ' has' : 's have'} no Firestore profile —
          usually a signup that failed partway through.
        </p>
      )}
    </div>
  );
}
