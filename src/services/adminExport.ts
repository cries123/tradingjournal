import type { AdminUserSummary } from './admin';
import type { BrokerSupportRequest } from './brokerSupportRequests';
import type { BugReport } from './bugReports';

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const content = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportUsersCsv(users: AdminUserSummary[]): void {
  downloadCsv('trend-chasers-users.csv', [
    [
      'username',
      'email',
      'uid',
      'signed_up',
      'last_login',
      'trade_count',
      'last_trade',
      'coach_share',
    ],
    ...users.map((u) => [
      u.username ?? '',
      u.email,
      u.uid,
      u.createdAt ? new Date(u.createdAt).toISOString() : '',
      u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '',
      String(u.tradeCount),
      u.lastTradeDate ?? '',
      u.coachShareEnabled ? 'yes' : 'no',
    ]),
  ]);
}

export function exportBugReportsCsv(reports: BugReport[]): void {
  downloadCsv('trend-chasers-bug-reports.csv', [
    ['created_at', 'status', 'email', 'username', 'description', 'steps', 'admin_note', 'page_url'],
    ...reports.map((r) => [
      r.createdAt,
      r.status,
      r.email,
      r.username ?? '',
      r.description,
      r.steps,
      r.adminNote ?? '',
      r.pageUrl,
    ]),
  ]);
}

export function exportBrokerRequestsCsv(requests: BrokerSupportRequest[]): void {
  downloadCsv('trend-chasers-broker-requests.csv', [
    [
      'created_at',
      'status',
      'broker',
      'email',
      'username',
      'export_method',
      'details',
      'admin_note',
    ],
    ...requests.map((r) => [
      r.createdAt,
      r.status,
      r.brokerName,
      r.email,
      r.username ?? '',
      r.exportMethod,
      r.details,
      r.adminNote ?? '',
    ]),
  ]);
}
