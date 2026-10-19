import type { ReactNode } from 'react';
import type { MonthlyReport } from '../../utils/monthlyReport';
import { formatCurrency } from '../../utils/format';

type Currency = Parameters<typeof formatCurrency>[1];

/*
 * The report is a document, not a screen: black on white, fixed colours rather than the theme, so
 * it prints legibly on any printer and reads the same in a PDF viewer as it did in the app. Greens
 * and reds are darker than the app's, which are tuned for a dark background and wash out on paper.
 */
const GAIN = 'text-[#2f7a0c]';
const LOSS = 'text-red-600';
const tone = (n: number) => (n > 0 ? GAIN : n < 0 ? LOSS : 'text-slate-500');

function Figure({ label, value, note, valueClass = 'text-slate-900' }: { label: string; value: ReactNode; note?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 text-[15px] font-bold tabular-nums leading-tight ${valueClass}`}>{value}</p>
      {note && <p className="mt-0.5 text-[10px] text-slate-500 leading-snug">{note}</p>}
    </div>
  );
}

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`report-section ${className}`}>
      <h2 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

/**
 * One month of a journal, as a page somebody can keep or hand to a mentor.
 *
 * Every figure comes from buildMonthlyReport, which uses the same functions as the dashboard; this
 * only lays them out. No charts, by the same decision as the dashboard's: figures you can act on.
 */
export function MonthlyReportDocument({
  report,
  currency,
  username,
  generatedOn,
}: {
  report: MonthlyReport;
  currency?: Currency;
  username?: string | null;
  generatedOn: string;
}) {
  const money = (n: number) => formatCurrency(n, currency);
  const { stats, insights } = report;

  return (
    <article className="monthly-report bg-white text-slate-900 font-sans">
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#2f7a0c]">Trend Chasers</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{report.label}</h1>
          <p className="text-sm text-slate-600">Monthly performance report</p>
        </div>
        <div className="text-right text-[11px] leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-900">{report.scope}</p>
          {username && <p>@{username}</p>}
          <p>Generated {generatedOn}</p>
        </div>
      </header>

      {!report.hasTrades ? (
        <p className="py-16 text-center text-sm text-slate-500">No trades in {report.label}.</p>
      ) : (
        <div className="mt-5 space-y-6">
          <section className="report-section">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Net P&amp;L</p>
            <p className={`text-4xl font-extrabold tabular-nums tracking-tight ${tone(stats.netPnl)}`}>{money(stats.netPnl)}</p>
            <p className="mt-1 text-xs text-slate-600">
              {stats.totalTrades} {stats.totalTrades === 1 ? 'trade' : 'trades'} · {stats.tradingDays}{' '}
              {stats.tradingDays === 1 ? 'trading day' : 'trading days'} · average {money(stats.avgProfitPerDay)} a day
            </p>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <Figure
                label="Win rate"
                value={`${stats.winRate.toFixed(0)}%`}
                note={report.breakeven !== null ? `${report.breakeven.toFixed(0)}% needed to break even` : undefined}
                valueClass={report.breakeven !== null ? tone(stats.winRate - report.breakeven) : 'text-slate-900'}
              />
              <Figure
                label="Profit factor"
                value={stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
                valueClass={tone(stats.profitFactor - 1)}
              />
              <Figure
                label="Avg win / avg loss"
                value={insights && insights.avgLoss > 0 ? `${money(insights.avgWin)} / ${money(-insights.avgLoss)}` : '—'}
              />
              <Figure
                label="Expectancy / trade"
                value={money(stats.avgProfitPerTrade)}
                valueClass={tone(stats.avgProfitPerTrade)}
              />
              <Figure label="Wins / losses" value={`${stats.winningTrades} / ${stats.losingTrades}`} />
              <Figure
                label="Best day"
                value={insights?.bestDay ? money(insights.bestDay.pnl) : '—'}
                note={insights?.bestDay ? shortDate(insights.bestDay.date) : undefined}
                valueClass={GAIN}
              />
              <Figure
                label="Worst day"
                value={insights?.worstDay ? money(insights.worstDay.pnl) : '—'}
                note={insights?.worstDay ? shortDate(insights.worstDay.date) : undefined}
                valueClass={LOSS}
              />
              <Figure
                label="Max drawdown"
                value={insights ? money(-insights.maxDrawdown) : '—'}
                note={report.fees > 0 ? `${money(report.fees)} paid in fees` : undefined}
                valueClass={insights && insights.maxDrawdown > 0 ? LOSS : 'text-slate-900'}
              />
            </div>
          </section>

          <Section title="Calendar">
            <table className="w-full table-fixed border-collapse text-[10px]">
              <thead>
                <tr className="text-slate-500">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Week'].map((d) => (
                    <th key={d} className="pb-1 text-left font-semibold uppercase tracking-wide">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.days.map((d, di) => (
                      <td key={di} className="p-0.5 align-top">
                        {d.day !== null && (
                          <div
                            className={`h-11 rounded border px-1.5 py-1 ${
                              d.pnl === null
                                ? 'border-slate-200'
                                : d.pnl >= 0
                                  ? 'border-[#b8f59a] bg-[#f2fdea]'
                                  : 'border-red-300 bg-red-50'
                            }`}
                          >
                            <p className="text-slate-500 leading-none">{d.day}</p>
                            {d.pnl !== null && (
                              <p className={`mt-1 font-bold tabular-nums leading-none ${tone(d.pnl)}`}>{money(d.pnl)}</p>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="p-0.5 align-top">
                      {week.trades > 0 && (
                        <div className="h-11 rounded border border-slate-300 bg-slate-50 px-1.5 py-1">
                          <p className="text-slate-500 leading-none">{week.trades} trade{week.trades === 1 ? '' : 's'}</p>
                          <p className={`mt-1 font-bold tabular-nums leading-none ${tone(week.pnl)}`}>{money(week.pnl)}</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <div className="grid grid-cols-2 gap-6">
            <Section title="By symbol">
              <Table
                head={['Symbol', 'Trades', 'Win', 'P&L']}
                rows={report.symbols.map((s) => [
                  s.symbol,
                  String(s.trades),
                  `${s.winRate.toFixed(0)}%`,
                  <span key="p" className={tone(s.pnl)}>{money(s.pnl)}</span>,
                ])}
              />
            </Section>

            <div className="space-y-6">
              <Section title={report.direction.title}>
                <Table
                  head={['', 'Trades', 'Win', 'P&L']}
                  rows={report.direction.groups
                    .filter((g) => g.trades > 0)
                    .map((g) => [
                      g.label,
                      String(g.trades),
                      `${g.winRate.toFixed(0)}%`,
                      <span key="p" className={tone(g.pnl)}>{money(g.pnl)}</span>,
                    ])}
                />
              </Section>
              <Section title="By weekday">
                <Table
                  head={['Day', 'Days traded', 'P&L']}
                  rows={report.weekdays.map((w) => [
                    w.label,
                    String(w.days),
                    <span key="p" className={tone(w.pnl)}>{money(w.pnl)}</span>,
                  ])}
                />
              </Section>
            </div>
          </div>

          {report.violations !== null && (
            <Section title="Your own rules">
              {report.violations.length === 0 ? (
                <p className="text-xs text-slate-600">No breaches of your trading rules this month.</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-700">
                  {report.violations.slice(0, 12).map((v) => (
                    <li key={`${v.date}-${v.type}`} className="flex gap-3">
                      <span className="w-16 shrink-0 tabular-nums text-slate-500">{shortDate(v.date)}</span>
                      <span>{v.message}</span>
                    </li>
                  ))}
                  {report.violations.length > 12 && (
                    <li className="text-slate-500">…and {report.violations.length - 12} more.</li>
                  )}
                </ul>
              )}
            </Section>
          )}
        </div>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-3 text-[9px] leading-relaxed text-slate-500">
        Every figure is computed by Trend Chasers from the trades in this journal — the same numbers the
        app shows. Profit and loss are net of the fees recorded on each trade. trendchasers.net
      </footer>
    </article>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-500">Nothing to show.</p>;
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="border-b border-slate-300 text-slate-500">
          {head.map((h, i) => (
            <th key={i} className={`pb-1 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className="border-b border-slate-100">
            {row.map((cell, ci) => (
              <td key={ci} className={`py-1 tabular-nums ${ci === 0 ? 'text-left font-medium' : 'text-right'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Jul 14", from a YYYY-MM-DD key, parsed by hand so no timezone can shift it a day. */
function shortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
