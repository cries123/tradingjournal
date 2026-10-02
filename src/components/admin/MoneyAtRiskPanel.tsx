import { AlertTriangle, CreditCard, LogOut, PlugZap, Undo2 } from 'lucide-react';
import { AdminUserRef } from './AdminUserRef';
import { TIER_PLANS } from '../../config/tiers';
import type { RiskKind, RiskRow } from '../../utils/adminRisk';

interface MoneyAtRiskPanelProps {
  rows: RiskRow[];
  onOpenUser: (uid: string) => void;
  canOpenUser: (uid: string) => boolean;
}

/** What each row is, in the words you would use about it, plus how loudly it should read. */
const KINDS: Record<RiskKind, { icon: typeof CreditCard; label: string; tone: string }> = {
  'card-declined': { icon: CreditCard, label: 'Card declined', tone: 'text-red-400 bg-red-500/10' },
  leaving: { icon: LogOut, label: 'Cancelled — leaving', tone: 'text-amber-400 bg-amber-500/10' },
  'trial-cancelled': {
    icon: Undo2,
    label: 'Trial cancelled',
    tone: 'text-amber-400 bg-amber-500/10',
  },
  'trial-not-connected': {
    icon: PlugZap,
    label: 'Trial, no broker connected',
    tone: 'text-sky-400 bg-sky-500/10',
  },
};

function when(row: RiskRow): string {
  if (row.daysAway === null) return 'already failing';
  if (row.daysAway <= 0) return 'today';
  if (row.daysAway === 1) return 'tomorrow';
  return `in ${row.daysAway} days`;
}

/**
 * The accounts where money is about to stop, or already has.
 *
 * None of this was anywhere in the panel. `past_due` and `canceled` appeared in exactly one place —
 * inside a single user's modal, which you would only open if you already knew to look — so a failed
 * card was invisible until the customer wrote in. The webhook emails THEM; nothing told the owner.
 *
 * Deliberately short, and deliberately on the Overview. It is the one list whose job is to be
 * finished: every row is a person who can still be kept, and each one opens straight into the modal
 * that can email them.
 */
export function MoneyAtRiskPanel({ rows, onOpenUser, canOpenUser }: MoneyAtRiskPanelProps) {
  if (rows.length === 0) {
    return (
      <div className="panel-card rounded-xl p-5 text-sm text-text-secondary">
        <span className="font-medium text-text-primary">Nothing at risk.</span> No declined cards, no
        cancellations running out, no trial ending without a broker connected.
      </div>
    );
  }

  // Only what is actually being billed — a trial has never paid anything, so adding its list price
  // here would invent revenue on the one panel that exists to be honest about losing it.
  const atStake = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="panel-card rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3 border-b border-border/40 md:px-5">
        <p className="text-sm font-semibold">Needs saving</p>
        <p className="text-xs text-text-secondary">
          {rows.length} account{rows.length === 1 ? '' : 's'}
          {atStake > 0 && (
            <>
              {' · '}
              <span className="tabular-nums text-text-primary">${atStake}</span>/mo at stake
            </>
          )}
        </p>
      </div>

      <ul className="divide-y divide-border/30">
        {rows.map((row) => {
          const kind = KINDS[row.kind];
          const Icon = kind.icon;
          return (
            <li key={`${row.uid}-${row.kind}`} className="flex items-start gap-3 px-4 py-3 md:px-5">
              <span className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${kind.tone}`}>
                <Icon size={14} aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  <AdminUserRef uid={row.uid} onOpen={onOpenUser} canOpen={canOpenUser}>
                    {row.email}
                    {row.username ? ` (@${row.username})` : ''}
                  </AdminUserRef>
                </p>
                {/*
                  The reason and the deadline on one line, because either alone is unactionable: a
                  declined card you cannot date is urgent, and a cancellation three weeks out is not.
                */}
                <p className="text-xs text-text-secondary mt-0.5">
                  {kind.label} · {when(row)}
                  {row.value > 0 && ` · ${TIER_PLANS[row.tier].name} $${row.value}/mo`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="flex items-start gap-2 px-4 py-3 text-[11px] text-text-secondary border-t border-border/40 md:px-5">
        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-text-secondary/70" aria-hidden />
        Open a row to email them. Hand-granted plans never appear here — nobody is paying for one, so
        there is nothing to lose.
      </p>
    </div>
  );
}
