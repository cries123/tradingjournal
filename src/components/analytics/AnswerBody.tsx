import { parseAnswer, splitHeadline, type AnswerBlock, type AnswerSegment } from '../../utils/assistantFormat';

/**
 * One line of an answer. `figures` is how a figure is set: semibold in running text, where it has
 * to stand out of a sentence; regular in a table, where every cell is a number and bold on all of
 * them is bold on none; plain in the muted middle of a phone's table row, which the design greys.
 */
function Segments({ segments, figures = 'bold' }: { segments: AnswerSegment[]; figures?: 'bold' | 'regular' | 'plain' }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'bold') {
          return (
            <strong key={i} className="font-semibold text-text-primary">
              {seg.text}
            </strong>
          );
        }
        if (seg.kind === 'figure' && figures === 'plain') return <span key={i}>{seg.text}</span>;
        if (seg.kind === 'figure') {
          // Only an explicitly signed figure gets a colour. Guessing tone from the surrounding
          // sentence would mean the app asserting a gain or loss the model never stated.
          const tone =
            seg.positive === null
              ? 'text-text-primary'
              : seg.positive
                ? 'text-profit-bright'
                : 'text-loss-bright';
          return (
            <span key={i} className={`${figures === 'bold' ? 'font-semibold' : ''} tabular-nums ${tone}`}>
              {seg.text}
            </span>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}

/**
 * Body text per surface. The dock is a 400px panel, where 13px grey is right; the Assistant page
 * is a reading column, where a long answer in 13px slate-400 was the hardest text in the app to
 * read. There it is a size up and nearer white, at the approved design's 14px.
 */
const TEXT = {
  sm: 'text-[13px] leading-relaxed text-text-secondary',
  md: 'text-sm leading-[1.55] text-text-primary/90',
} as const;

type Table = Extract<AnswerBlock, { kind: 'table' }>;

const isEmpty = (cell: AnswerSegment[]) => cell.every((s) => !s.text.trim());

/**
 * A table the way a phone can hold it: no header row, the first column as the row's name, the
 * last as its figure, and anything between joined into one muted line — "17 · 41%". Four columns
 * of 13px across a 360px card left about forty pixels for each.
 */
function CompactTable({ table, className = '' }: { table: Table; className?: string }) {
  const last = table.header.length - 1;
  return (
    <div className={`overflow-hidden rounded-xl border border-white/[0.07] ${className}`}>
      {table.rows.map((row, r) => {
        const middle = row.slice(1, last).filter((cell) => !isEmpty(cell));
        return (
          <div key={r} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-[9px] text-[13px] ${r > 0 ? 'border-t border-white/[0.07]' : ''}`}>
            <span className="min-w-0 text-text-primary">
              <Segments segments={row[0]} />
            </span>
            <span className="tabular-nums text-text-secondary">
              {middle.map((cell, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <Segments segments={cell} figures="plain" />
                </span>
              ))}
            </span>
            {last > 0 ? (
              <b className="font-semibold tabular-nums text-text-primary">
                <Segments segments={row[last]} />
              </b>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The table as the desktop design draws it: a header row, hairlines, figures right-aligned. */
function FullTable({ table, className = '' }: { table: Table; className?: string }) {
  const align = (c: number) => (table.numeric[c] ? 'text-right' : 'text-left');
  return (
    <table className={`w-full max-w-[520px] border-separate border-spacing-0 overflow-hidden rounded-[10px] border border-white/[0.06] text-[13px] ${className}`}>
      <thead>
        <tr>
          {table.header.map((cell, c) => (
            <th key={c} className={`border-b border-white/[0.06] bg-bg-tertiary px-2.5 py-[7px] text-[11px] font-medium text-text-secondary/70 ${align(c)}`}>
              <Segments segments={cell} figures="plain" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className={`px-2.5 py-2 text-text-primary ${table.numeric[c] ? 'tabular-nums' : ''} ${align(c)} ${
                  r < table.rows.length - 1 ? 'border-b border-white/[0.06]' : ''
                }`}
              >
                <Segments segments={cell} figures="regular" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Renders an assistant answer as real paragraphs, lists, tables and highlighted figures, with its
 * opening bold line as a headline when it wrote one (see splitHeadline).
 */
export function AnswerBody({ answer, size = 'sm' }: { answer: string; size?: keyof typeof TEXT }) {
  const { headline, rest } = splitHeadline(parseAnswer(answer));
  const text = TEXT[size];
  const page = size === 'md';

  return (
    <div className={page ? 'space-y-2.5' : 'space-y-2'}>
      {headline && (
        <p className={page ? 'text-base font-bold leading-snug text-text-primary' : 'text-[13px] font-semibold text-text-primary'}>
          {headline}
        </p>
      )}
      {rest.map((block, i) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={i} className={text}>
              <Segments segments={block.segments} />
            </p>
          );
        }
        if (block.kind === 'table') {
          // The page shows the full table from lg up and the phone's compact one below it; the dock
          // is phone-width at every size.
          return page ? (
            <div key={i} className="py-0.5">
              <FullTable table={block} className="hidden lg:table" />
              <CompactTable table={block} className="lg:hidden" />
            </div>
          ) : (
            <CompactTable key={i} table={block} />
          );
        }
        if (page) {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-0.5 pl-[18px] ${text} leading-[1.6]`}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Segments segments={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <ul key={i} className="space-y-1.5">
            {block.items.map((item, j) => (
              <li key={j} className={`flex gap-2.5 ${text}`}>
                <span className="shrink-0 rounded-full bg-accent/70 mt-[7px] h-1 w-1" aria-hidden />
                <span className="min-w-0">
                  {block.ordered && (
                    <span className="mr-1 font-semibold text-text-primary tabular-nums">{j + 1}.</span>
                  )}
                  <Segments segments={item} />
                </span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
