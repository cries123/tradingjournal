import { useMemo } from 'react';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Trade } from '../types';
import { useSettings } from '../context/useSettings';
import { useEntitlement } from '../context/useEntitlement';
import { formatCurrency, toDateKey } from '../utils/format';
import { ruleStandingToday } from '../utils/ruleStanding';

/**
 * The risk rules, said out loud while there is still a decision left to make.
 *
 * Nothing in this journal used to tell a trader they had broken their own limit until the evening,
 * on a panel they had to scroll to. That is a record of the mistake, not a chance not to make it —
 * and the data Jay's own journal produced makes the case: days with eleven or more trades lost
 * $496 on average, days with one or two made $163.
 *
 * Rendered above the dashboard, and only when there is something to say: rules turned on, trades
 * today, and either a breach or a limit within reach. A green all-clear every morning is how a
 * warning becomes wallpaper.
 */
export function RuleStandingBanner({ trades }: { trades: Trade[] }) {
  const { settings } = useSettings();
  const { has } = useEntitlement();

  const today = useMemo(() => toDateKey(new Date()), []);
  const standing = useMemo(
    () => ruleStandingToday(trades, settings.tradingRules, today),
    [trades, settings.tradingRules, today],
  );

  if (!has('ruleAlerts') || !settings.ruleAlertsEnabled) return null;
  if (!standing || standing.level === 'clear') return null;

  const breached = standing.level === 'breached';

  return (
    <div
      role="status"
      className={`mb-3 rounded-xl border p-3 md:p-3.5 flex items-start gap-3 ${
        breached
          ? 'border-loss/40 bg-loss/10'
          : 'border-amber-500/35 bg-amber-500/5'
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${breached ? 'text-loss-bright' : 'text-amber-400'}`}>
        {breached ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${breached ? 'text-loss-bright' : 'text-amber-300'}`}>
          {breached
            ? standing.breaches.length === 1
              ? 'You have broken one of your own rules today'
              : `You have broken ${standing.breaches.length} of your own rules today`
            : 'You are close to a limit you set'}
        </p>

        <ul className="mt-1 space-y-0.5">
          {/* Warnings first: a breach is history and a warning is a decision. */}
          {standing.warnings.map((w) => (
            <li key={`w-${w.type}`} className="text-xs text-text-secondary leading-relaxed">
              {w.message}
            </li>
          ))}
          {standing.breaches.map((b) => (
            <li key={`b-${b.type}`} className="text-xs text-text-secondary leading-relaxed">
              {b.message}
            </li>
          ))}
        </ul>

        <p className="mt-1.5 text-[11px] text-text-secondary/80 tabular-nums">
          Today: {standing.tradeCount} trade{standing.tradeCount === 1 ? '' : 's'},{' '}
          <span className={standing.dayPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
            {formatCurrency(standing.dayPnl, settings.currency)}
          </span>
        </p>
      </div>

      {!breached && (
        <span className="hidden sm:flex shrink-0 items-center gap-1.5 text-[10px] text-text-secondary/70">
          <ShieldCheck size={12} />
          Your rules
        </span>
      )}
    </div>
  );
}
