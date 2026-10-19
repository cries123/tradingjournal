import { Fragment, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  Breakdown,
  BreakdownKey,
  BreakdownSet,
  CapTest,
  GroupRow,
  GroupTable,
  MissingBreakdown,
} from '../../utils/performanceBreakdowns';
import { breakdownTsv, findEntry as find, isBreakdown } from '../../utils/performanceBreakdowns';
import { capitalize, signed, type Fmt, type Part, type PeriodWords, type Tone } from '../../utils/performanceScreen';
import type { BreakevenStats } from '../../utils/brokerAnalytics';

const TONE: Record<Tone, string> = {
  profit: 'text-profit-bright',
  loss: 'text-loss-bright',
  neutral: 'text-text-primary',
};

const toneClass = (n: number) => (n > 0 ? TONE.profit : n < 0 ? TONE.loss : '');

/*
 * A word joiner after the dash in a range, so "3–5 trades" never breaks into "3–" and "5" across two
 * lines — browsers treat an en dash as a break opportunity. Display only: copied text stays clean.
 */
const keepRanges = (text: string) => text.replace(/(\d)–(\d)/g, '$1–⁠$2');

/** A sentence with its figures in their colors. */
export function Parts({ parts }: { parts: readonly Part[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <Fragment key={i}>{keepRanges(p)}</Fragment>
        ) : (
          <span key={i} className={TONE[p.tone]}>
            {keepRanges(p.text)}
          </span>
        ),
      )}
    </>
  );
}

/**
 * A group's share of the period, drawn either side of zero.
 *
 * Half the track each way, scaled to the biggest row, so the 4th-and-later bar reaching the edge
 * means "this is the largest number in the table" in either direction. The losing bar grows from
 * the middle outwards: bar-in scales from its left edge, so the origin is moved to the right for
 * anything drawn left of zero. Reduced motion turns bar-in off in the stylesheet.
 */
function ZeroBar({ value, maxAbs, index, className }: { value: number; maxAbs: number; index: number; className: string }) {
  const width = maxAbs > 0 && value !== 0 ? Math.max((Math.abs(value) / maxAbs) * 50, 1.5) : 0;
  const style =
    value >= 0
      ? ({ left: '50%', width: `${width}%`, '--i': index } as CSSProperties)
      : ({ right: '50%', width: `${width}%`, transformOrigin: 'right', '--i': index } as CSSProperties);
  return (
    <div aria-hidden className={`relative rounded-[5px] bg-white/[0.05] ${className}`}>
      <span className="absolute -bottom-[3px] -top-[3px] left-1/2 w-px bg-white/20" />
      {width > 0 && (
        <i className={`bar-in absolute inset-y-0 rounded-[5px] ${value >= 0 ? 'bg-profit-bright' : 'bg-loss-bright'}`} style={style} />
      )}
    </div>
  );
}

const TH = 'border-b border-white/[0.06] px-2.5 py-[7px] text-left text-[11px] font-medium text-text-secondary/70';
const TD = 'border-b border-white/[0.06] px-2.5 py-[11px] whitespace-nowrap';

function GroupTableView({ table, fmt }: { table: GroupTable; fmt: Fmt }) {
  const hasWin = table.rows.some((r) => r.winRate !== null);
  const maxAbs = Math.max(...table.rows.map((r) => Math.abs(r.net)), 1);
  const per = (r: GroupRow) => (r.per === null ? '—' : signed(r.per, fmt));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={TH}>{table.heading}</th>
            <th className={`${TH} text-right`}>{table.unit === 'day' ? 'Days' : 'Trades'}</th>
            {hasWin && <th className={`${TH} text-right`}>{table.winLabel}</th>}
            <th className={`${TH} text-right`}>Avg / {table.unit}</th>
            <th className={`${TH} text-right`}>Net</th>
            <th className={TH}>Contribution</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {table.rows.map((r, i) => (
            <tr key={r.label} className={r.highlight ? 'bg-loss-bright/[0.05]' : undefined}>
              <td className={`${TD} ${r.highlight ? 'font-semibold' : ''}`}>{r.label}</td>
              <td className={`${TD} text-right`}>{r.count}</td>
              {hasWin && <td className={`${TD} text-right`}>{r.winRate === null ? '—' : `${Math.round(r.winRate)}%`}</td>}
              <td className={`${TD} text-right ${toneClass(r.per ?? 0)}`}>{per(r)}</td>
              <td className={`${TD} text-right ${toneClass(r.net)} ${r.highlight ? 'font-semibold' : ''}`}>{signed(r.net, fmt)}</td>
              <td className={TD}>
                <ZeroBar value={r.net} maxAbs={maxAbs} index={i} className="h-2.5 w-[min(220px,15vw)]" />
              </td>
            </tr>
          ))}
          {table.total && (
            <tr>
              <td className={`${TD} text-text-secondary`}>{table.total.label}</td>
              <td className={`${TD} text-right text-text-secondary`}>{table.total.count}</td>
              {hasWin && <td className={`${TD} text-right text-text-secondary`}>{table.total.winRate === null ? '—' : `${Math.round(table.total.winRate)}%`}</td>}
              <td className={`${TD} text-right ${toneClass(table.total.per ?? 0)}`}>{per(table.total)}</td>
              <td className={`${TD} text-right ${toneClass(table.total.net)}`}>{signed(table.total.net, fmt)}</td>
              <td className={TD} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Facts({ facts }: { facts: Breakdown['facts'] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label} className="rounded-[10px] bg-white/[0.03] px-3 py-2.5">
          <dt className="text-[11px] text-text-secondary">{f.label}</dt>
          <dd className={`mt-0.5 text-[15px] font-semibold tabular-nums ${TONE[f.tone]}`}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The playbook, rule by rule — the Discipline breakdown's second half, kept from its card. */
function Rules({ rules, fmt }: { rules: Breakdown['rules']; fmt: Fmt }) {
  if (rules.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs text-text-secondary">Rule by rule · per trade</p>
      <ul className="grid gap-2 lg:grid-cols-2">
        {rules.map((row) => (
          <li key={row.rule} className="rounded-[10px] bg-white/[0.03] p-2.5">
            <p className="break-words text-[13px] font-medium leading-snug">{row.rule}</p>
            <p className="mt-0.5 text-xs tabular-nums text-text-secondary">
              Followed {row.followed}: {fmt(row.followedPerTrade)} · Skipped {row.skipped}: {fmt(row.skippedPerTrade)}
            </p>
            <p className={`mt-0.5 text-xs font-semibold ${row.costOfSkipping > 0 ? 'text-loss-bright' : 'text-text-secondary'}`}>
              {row.costOfSkipping > 0 ? `Skipping it costs ${fmt(row.costOfSkipping)} a trade` : 'Skipping it has not cost you so far'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Test it in the rule simulator": shown only when the cap would have helped, with the figure the
 * simulator itself computed. The button needs JournalApp to say where the simulator is; without it
 * the finding still stands, it just has nowhere to go.
 */
function CapCallout({ cap, period, fmt, onOpenSimulator, variant }: { cap: CapTest; period: PeriodWords; fmt: Fmt; onOpenSimulator?: () => void; variant: 'desktop' | 'phone' }) {
  const simulated = <span className={toneClass(cap.simulated)}>{signed(cap.simulated, fmt)}</span>;
  const actual = <span className={toneClass(cap.actual)}>{signed(cap.actual, fmt)}</span>;
  if (variant === 'phone') {
    return (
      <div className="mt-3.5 flex items-center gap-3 rounded-[14px] border border-accent/35 bg-accent/[0.06] p-3.5">
        <div className="min-w-0 flex-1">
          <b className="text-[15px]">Test a {cap.cap}-trade cap</b>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {capitalize(period.noun)} would have been {simulated}, not {actual}.
          </p>
        </div>
        {onOpenSimulator && (
          <button type="button" onClick={onOpenSimulator} className="btn-primary h-9 shrink-0 px-3.5 text-[13px] font-bold focus-ring">
            Simulate
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/[0.05] px-4 py-3.5">
      <div className="min-w-0">
        <b className="text-sm">Test it in the rule simulator</b>
        <p className="mt-[3px] text-[13px] text-text-secondary">
          A {cap.cap}-trade daily cap would have turned {period.noun} into {simulated} instead of {actual}.
        </p>
      </div>
      {onOpenSimulator && (
        <button type="button" onClick={onOpenSimulator} className="btn-primary shrink-0 rounded-[9px] px-[11px] py-1.5 text-xs font-bold focus-ring">
          Simulate →
        </button>
      )}
    </div>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** "Copy table", with a moment of "Copied" so the press is seen to have done something. */
function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // Clipboard access refused (an insecure context, or a browser setting): say so on the button.
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 1600);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded-[9px] border border-border px-[11px] py-1.5 text-xs text-text-secondary hover:text-text-primary focus-ring"
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy table'}
    </button>
  );
}

/** The chosen breakdown at full size: the desktop's right-hand card. */
function BreakdownCard({ b, fmt, period, onOpenSimulator }: { b: Breakdown; fmt: Fmt; period: PeriodWords; onOpenSimulator?: () => void }) {
  return (
    <section aria-label={b.title} className="panel-card rounded-[14px] p-4">
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <h2 className="flex flex-wrap items-baseline gap-x-2.5 text-sm font-semibold">
          {b.title}
          <small className="text-xs font-normal text-text-secondary">{b.about}</small>
        </h2>
        {(b.table || b.facts.length > 0) && <CopyButton text={breakdownTsv(b, fmt)} />}
      </div>
      <p className="mb-3.5 mt-0.5 text-lg font-semibold leading-[1.35]">
        <Parts parts={b.lead} />
      </p>
      {b.table && <GroupTableView table={b.table} fmt={fmt} />}
      <Facts facts={b.facts} />
      <Rules rules={b.rules} fmt={fmt} />
      {b.cap && <CapCallout cap={b.cap} period={period} fmt={fmt} onOpenSimulator={onOpenSimulator} variant="desktop" />}
      <p className="mt-3 text-xs leading-normal text-text-secondary/70">How this is counted: {lowerFirst(b.how)}</p>
    </section>
  );
}

/** A breakdown the journal cannot draw yet, chosen from "Needs your input": what to record. */
function MissingCard({ m }: { m: MissingBreakdown }) {
  return (
    <section aria-label={m.title} className="panel-card rounded-[14px] p-4">
      <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2.5 text-sm font-semibold">
        {m.title}
        <small className="text-xs font-normal text-text-secondary">{m.short}</small>
      </h2>
      <p className="text-[15px] leading-relaxed text-text-secondary">{m.needs}</p>
    </section>
  );
}

/** The edge as a gauge: where the win rate is, and the mark it has to clear. */
function EdgeCard({ edge, stats, onDetails }: { edge: Breakdown; stats: BreakevenStats; onDetails: () => void }) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <section className="panel-card rounded-[14px] p-4">
      <div className="mb-1 flex items-center justify-between gap-2.5">
        <h2 className="text-sm font-semibold">Edge</h2>
        <button type="button" onClick={onDetails} className="whitespace-nowrap rounded text-xs text-accent hover:text-accent/80 focus-ring">
          Details →
        </button>
      </div>
      <p className={`my-1 text-[22px] font-bold tabular-nums ${TONE[edge.figure.tone]}`}>{edge.figure.text}</p>
      <div className="relative mt-3 h-2 rounded-[5px] bg-white/[0.05]">
        <i
          className={`absolute inset-y-0 left-0 rounded-[5px] ${stats.gap >= 0 ? 'bg-profit-bright' : 'bg-loss-bright'}`}
          style={{ width: `${clamp(stats.winRate)}%` }}
        />
        <span aria-hidden className="absolute -bottom-1 -top-1 w-0.5 bg-text-primary" style={{ left: `${clamp(stats.requiredWinRate)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-text-secondary/70">
        <span>0%</span>
        <span className="tabular-nums">
          you win {stats.winRate.toFixed(0)}% · need {stats.requiredWinRate.toFixed(0)}%
        </span>
        <span>100%</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-[1.45] text-text-secondary">
        <Parts parts={edge.phoneLead} />
      </p>
    </section>
  );
}

/** Calls, puts and shares in three lines — the mix is worth seeing whichever breakdown is open. */
function MixCard({ b, fmt, onDetails }: { b: Breakdown; fmt: Fmt; onDetails: () => void }) {
  const rows = b.table?.rows ?? [];
  return (
    <section className="panel-card rounded-[14px] p-4">
      <div className="mb-1 flex items-center justify-between gap-2.5">
        <h2 className="text-sm font-semibold">Calls, puts and shares</h2>
        <button type="button" onClick={onDetails} className="whitespace-nowrap rounded text-xs text-accent hover:text-accent/80 focus-ring">
          Details →
        </button>
      </div>
      <table className="w-full border-collapse text-[12.5px] tabular-nums">
        <tbody>
          {rows.map((r, i) => {
            const edge = i === rows.length - 1 ? '' : 'border-b border-white/[0.06]';
            return (
              <tr key={r.label}>
                <td className={`py-2 ${edge}`}>{r.label}</td>
                <td className={`py-2 text-right text-text-secondary ${edge}`}>
                  {r.count} · {Math.round(r.winRate ?? 0)}%
                </td>
                <td className={`py-2 text-right ${toneClass(r.net)} ${edge}`}>{signed(r.net, fmt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ListHeading({ children }: { children: string }) {
  return <h3 className="mx-2.5 mb-1.5 mt-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-secondary/70">{children}</h3>;
}

interface BreakdownsProps {
  set: BreakdownSet;
  fmt: Fmt;
  onOpenSimulator?: () => void;
  /** A phone opens a breakdown as a page of its own; the screen above owns which. */
  onPhoneOpen: (key: BreakdownKey) => void;
}

/**
 * The body of the Performance screen: the breakdowns down the left, biggest first, and the chosen
 * one at full size beside them, with the edge and the calls-puts-shares mix under it.
 *
 * It replaced a wall of cards in which the reader had to find the $5,600 finding among the $300
 * ones, then read twelve sentences that were often the same leak seen three ways. The list says
 * which matters, in dollars, before anything is opened; the card says it once. The fields a broker
 * import does not carry are named at the bottom of the same list, each with why it is empty, rather
 * than drawn as dashed cards.
 *
 * On a phone the same list is rows with their figures, and a tap opens the breakdown as its own page
 * (PhoneBreakdownPage, drawn by PerformanceContent so the page can replace the whole screen).
 */
export function PerformanceBreakdowns({ set, fmt, onOpenSimulator, onPhoneOpen }: BreakdownsProps) {
  const [selected, setSelected] = useState<BreakdownKey | null>(null);
  const shown = find(set, selected) ?? set.list[0] ?? set.edge ?? set.missing[0] ?? null;
  const mix = set.list.find((b) => b.key === 'instruments');

  if (!shown) return null;

  const row = (b: Breakdown) => {
    const on = shown.key === b.key;
    return (
      <button
        key={b.key}
        type="button"
        onClick={() => setSelected(b.key)}
        aria-current={on ? 'true' : undefined}
        className={`flex w-full items-center justify-between gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left text-[13px] focus-ring ${
          on ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
        }`}
      >
        <span className={`min-w-0 truncate ${on ? 'font-semibold' : ''}`}>{b.title}</span>
        <b className={`shrink-0 text-[12.5px] font-semibold tabular-nums ${b.figure.tone === 'neutral' ? '' : TONE[b.figure.tone]}`}>{b.figure.text}</b>
      </button>
    );
  };

  return (
    <>
      {/* ── Desktop: the list and the chosen breakdown ── */}
      <div className="hidden items-start gap-4 md:grid md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Breakdowns" className="panel-card rounded-[14px] p-2">
          {set.list.length > 0 && (
            <>
              <ListHeading>Breakdowns · biggest first</ListHeading>
              {set.list.map(row)}
            </>
          )}
          {set.missing.length > 0 && (
            <>
              <ListHeading>Needs your input</ListHeading>
              {set.missing.map((m) => {
                const on = shown.key === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSelected(m.key)}
                    aria-current={on ? 'true' : undefined}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left text-[13px] focus-ring ${
                      on ? 'bg-white/[0.05] text-text-secondary' : 'text-text-secondary/70 hover:text-text-secondary'
                    }`}
                  >
                    <span className="min-w-0 truncate">{m.title}</span>
                    <small className="shrink-0 text-[11px] text-text-secondary/70">{m.short}</small>
                  </button>
                );
              })}
            </>
          )}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {isBreakdown(shown) ? (
            <BreakdownCard key={shown.key} b={shown} fmt={fmt} period={set.period} onOpenSimulator={onOpenSimulator} />
          ) : (
            <MissingCard m={shown} />
          )}
          {(set.edge || mix) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {set.edge && set.breakeven && <EdgeCard edge={set.edge} stats={set.breakeven} onDetails={() => setSelected('edge')} />}
              {mix && <MixCard b={mix} fmt={fmt} onDetails={() => setSelected('instruments')} />}
            </div>
          )}
        </div>
      </div>

      {/* ── Phone: rows with their figures; a tap opens the breakdown as a page ── */}
      <div className="md:hidden">
        {(set.list.length > 0 || set.edge) && (
          <>
            <h2 className="mx-1 mb-2 mt-2 text-[13px] font-bold text-text-secondary">Breakdowns · biggest first</h2>
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-bg-card">
              {[...set.list, ...(set.edge ? [set.edge] : [])].map((b, i) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => onPhoneOpen(b.key)}
                  className={`flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left text-[15px] focus-ring ${i > 0 ? 'border-t border-white/[0.07]' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{b.title}</span>
                  <span className={`whitespace-nowrap text-[13px] font-semibold tabular-nums ${b.figure.tone === 'neutral' ? '' : TONE[b.figure.tone]}`}>{b.figure.text}</span>
                  <ChevronRight size={16} className="shrink-0 text-text-secondary/70" aria-hidden />
                </button>
              ))}
            </div>
          </>
        )}
        {set.missing.length > 0 && (
          <>
            <h2 className="mx-1 mb-2 mt-5 text-[13px] font-bold text-text-secondary">Needs your input</h2>
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-bg-card">
              {set.missing.map((m, i) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => onPhoneOpen(m.key)}
                  className={`flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left text-[15px] text-text-secondary focus-ring ${i > 0 ? 'border-t border-white/[0.07]' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="whitespace-nowrap text-xs text-text-secondary/70">{m.short}</span>
                  <ChevronRight size={16} className="shrink-0 text-text-secondary/70" aria-hidden />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** One group as the phone draws it: a card with its bar under the counts and its figures on the right. */
function PhoneRow({ r, unit, maxAbs, index, fmt }: { r: GroupRow; unit: 'trade' | 'day'; maxAbs: number; index: number; fmt: Fmt }) {
  const counted = `${r.count} ${unit}${r.count === 1 ? '' : 's'}`;
  const rate = r.winRate === null ? '' : ` · ${Math.round(r.winRate)}% ${unit === 'day' ? 'green' : 'win'}`;
  return (
    <div
      className={`grid grid-cols-[minmax(44px,max-content)_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[14px] border p-3 ${
        r.highlight ? 'border-loss-bright/40 bg-loss-bright/[0.06]' : 'border-white/[0.07] bg-bg-card'
      }`}
    >
      <div className="max-w-[96px] truncate text-[15px] font-bold">{r.short}</div>
      <div className="min-w-0 text-xs text-text-secondary">
        <span className="tabular-nums">
          {counted}
          {rate}
        </span>
        <ZeroBar value={r.net} maxAbs={maxAbs} index={index} className="mt-[7px] h-2" />
      </div>
      <div className="flex flex-col gap-0.5 text-right tabular-nums">
        <b className={`text-[15px] ${toneClass(r.net)}`}>{signed(r.net, fmt)}</b>
        {r.per !== null && (
          <span className="text-[11px] text-text-secondary">
            {signed(r.per, fmt)} / {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A breakdown opened on a phone: its own page, with the way back at the top.
 *
 * The approved design's phone breakdown. The table becomes a stack of rows — a 390px screen has no
 * room for six columns — each with the counts, the bar either side of zero and the two figures, and
 * the rule simulator one tap away when a cap would have helped.
 */
export function PhoneBreakdownPage({
  entry,
  periodLabel,
  period,
  fmt,
  onBack,
  onOpenSimulator,
}: {
  entry: Breakdown | MissingBreakdown;
  periodLabel: string;
  period: PeriodWords;
  fmt: Fmt;
  onBack: () => void;
  onOpenSimulator?: () => void;
}) {
  const b = isBreakdown(entry) ? entry : null;
  const missing = isBreakdown(entry) ? null : entry;
  const maxAbs = b?.table ? Math.max(...b.table.rows.map((r) => Math.abs(r.net)), 1) : 1;
  return (
    // Opened from a row far down the list: start the page at its top, where the way back is.
    <div ref={(el) => el?.scrollIntoView?.({ block: 'start' })} className="md:hidden">
      <button type="button" onClick={onBack} className="mt-1 flex h-10 items-center gap-1 rounded text-[15px] text-accent focus-ring">
        <ChevronLeft size={18} aria-hidden />
        Performance
      </button>
      <h1 className="mb-1 mt-1.5 text-2xl font-extrabold tracking-tight">{entry.title}</h1>
      <p className="text-[13px] text-text-secondary">
        {periodLabel} · {b ? b.about : missing?.short}
      </p>
      {b ? (
        <>
          <p className="my-3.5 text-base font-semibold leading-[1.4]">
            <Parts parts={b.phoneLead} />
          </p>
          {b.table && (
            <div className="flex flex-col gap-2">
              {b.table.rows.map((r, i) => (
                <PhoneRow key={r.label} r={r} unit={b.table!.unit} maxAbs={maxAbs} index={i} fmt={fmt} />
              ))}
            </div>
          )}
          <Facts facts={b.facts} />
          <Rules rules={b.rules} fmt={fmt} />
          {b.cap && <CapCallout cap={b.cap} period={period} fmt={fmt} onOpenSimulator={onOpenSimulator} variant="phone" />}
          <p className="mx-0.5 mt-3 text-xs leading-normal text-text-secondary">{b.how}</p>
        </>
      ) : (
        <p className="mt-3.5 text-[15px] leading-relaxed text-text-secondary">{missing?.needs}</p>
      )}
    </div>
  );
}
