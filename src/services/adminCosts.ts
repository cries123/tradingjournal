import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import type { CostBreakdown, CostRates, UsageCounts } from '../config/costs';

export interface MonthCosts {
  month: string;
  counts: UsageCounts;
  breakdown: CostBreakdown;
  partial: boolean;
}

export interface CostReport {
  months: MonthCosts[];
  rates: CostRates;
  connectedNow: number;
  mrrNow: number;
  subscribers: number;
  topUsers: { uid: string; aiMessages: number; syncs: number; cost: number }[];
  purchases: { uid: string; email: string; tier: string; amount: number; at: string }[];
  warning: string | null;
}

export interface CostReportResult {
  report: CostReport | null;
  error: string | null;
}

/** Reads the cost report from the admin-only function. Never throws. */
export async function fetchCostReport(): Promise<CostReportResult> {
  if (!isFirebaseConfigured()) {
    return { report: null, error: 'Cost tracking needs the backend configured.' };
  }

  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return { report: null, error: 'Sign in to see costs.' };

    const res = await fetch('/api/admin-costs', {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });

    if (!res.ok) {
      return {
        report: null,
        error:
          res.status === 403 || res.status === 401
            ? 'Not authorised to read costs.'
            : 'Could not load the cost report.',
      };
    }

    return { report: (await res.json()) as CostReport, error: null };
  } catch {
    return { report: null, error: 'Could not reach the cost report.' };
  }
}
