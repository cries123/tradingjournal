/**
 * Turns the assistant's plain-text answer into renderable pieces.
 *
 * The model writes like a person — short paragraphs, the occasional bullet list, bold on the
 * thing that matters — and all of it was landing on screen as literal asterisks and hyphens
 * inside a `whitespace-pre-wrap` block. This is a deliberately tiny parser rather than a markdown
 * library: the system prompt asks for a few short paragraphs and forbids headers, so bullets,
 * bold and numbers are the entire surface area, and pulling in a renderer to cover CommonMark
 * would be a lot of bundle for syntax that never arrives.
 *
 * Figures get marked up too. An answer's whole job is to put the trader's own numbers in front of
 * them, so the numbers should be findable at a glance instead of buried mid-sentence.
 */

export type AnswerSegment =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'figure'; text: string; positive: boolean | null };

export type AnswerBlock =
  | { kind: 'paragraph'; segments: AnswerSegment[] }
  | { kind: 'list'; items: AnswerSegment[][]; ordered: boolean }
  /**
   * A markdown table: a header row, a |---| rule, then rows. `numeric` marks the columns whose
   * every body cell is a figure, which are the ones drawn right-aligned.
   *
   * The prompt does not ask for tables and nothing here makes the model write one. But nothing
   * forbids it either, and a comparison of two buckets is exactly when it reaches for one — which
   * arrived on screen as rows of pipes and dashes. A table it chooses to send is now drawn as one.
   */
  | { kind: 'table'; header: AnswerSegment[][]; rows: AnswerSegment[][][]; numeric: boolean[] };

/** Currency, percentages, R-multiples and bare decimals — the shapes a trading answer quotes. */
const FIGURE = /((?:[-+]?\$[\d,]+(?:\.\d+)?)|(?:[-+]?[\d,]+(?:\.\d+)?%)|(?:[-+]?\d+(?:\.\d+)?R\b))/g;

/**
 * Whether a figure reads as a gain or a loss, or neither.
 *
 * Only an explicit sign decides it. A bare "$412.55" is not a loss just because the sentence
 * around it mentions one — colouring it red on a guess would be the app asserting something the
 * model didn't say, and on a P&L screen that is not a cosmetic mistake.
 */
function figureTone(text: string): boolean | null {
  if (text.startsWith('-')) return false;
  if (text.startsWith('+')) return true;
  return null;
}

function splitFigures(text: string): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(FIGURE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    out.push({ kind: 'figure', text: match[0], positive: figureTone(match[0]) });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** A bold run that is nothing but one figure — "**-$553.27**". */
const WHOLE_FIGURE = new RegExp(`^${FIGURE.source}$`);

/**
 * Splits on **bold**, then finds figures inside whatever is left.
 *
 * A bold run that is exactly one figure is read as that figure. The model bolds most of the numbers
 * it quotes, so "**-$553.27**" was coming out as plain bold white while the same loss written
 * without asterisks was red — the colouring missed the figures the answer leaned on hardest. The
 * figure style is already semibold, so nothing is lost by it.
 */
export function parseInline(line: string): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  let last = 0;
  for (const match of line.matchAll(/\*\*(.+?)\*\*/g)) {
    const at = match.index ?? 0;
    if (at > last) out.push(...splitFigures(line.slice(last, at)));
    const inner = match[1].trim();
    out.push(
      WHOLE_FIGURE.test(inner)
        ? { kind: 'figure', text: inner, positive: figureTone(inner) }
        : { kind: 'bold', text: match[1] },
    );
    last = at + match[0].length;
  }
  if (last < line.length) out.push(...splitFigures(line.slice(last)));
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
/** A table row: starts and ends with a pipe, with at least one between. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** The rule under a table's header: |---|:--:|---:|. */
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
/** A bare count — "17", "1,284.40" — which FIGURE leaves alone because it carries no unit. */
const BARE_NUMBER = /^[-+]?\d[\d,]*(\.\d+)?$/;

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * Pipe rows, as a table when they are one.
 *
 * Without the |---| rule under the first row it is not a table, just lines that happen to hold
 * pipes: null, and they stay in the paragraph around them exactly as they did before tables were
 * read. While an answer streams in, that is also what a half-arrived table is for a moment.
 */
function tableBlock(lines: string[]): AnswerBlock | null {
  if (lines.length < 2 || !TABLE_RULE.test(lines[1])) return null;
  const header = tableCells(lines[0]);
  const width = header.length;
  const body = lines.slice(2).map((l) => {
    const cells = tableCells(l).slice(0, width);
    while (cells.length < width) cells.push('');
    return cells;
  });
  const numeric = header.map((_, c) => {
    const column = body.map((r) => r[c].replace(/\*\*/g, '').trim()).filter(Boolean);
    return column.length > 0 && column.every((cell) => WHOLE_FIGURE.test(cell) || BARE_NUMBER.test(cell));
  });
  return {
    kind: 'table',
    header: header.map(parseInline),
    rows: body.map((r) => r.map(parseInline)),
    numeric,
  };
}

export function parseAnswer(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;
  let table: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', segments: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ kind: 'list', items: list.items.map(parseInline), ordered: list.ordered });
    list = null;
  };
  const flushTable = () => {
    if (table.length === 0) return;
    const block = tableBlock(table);
    if (block) {
      flushParagraph();
      blocks.push(block);
    } else {
      paragraph.push(...table.map((l) => l.trim()));
    }
    table = [];
  };

  for (const raw of answer.split('\n')) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushTable();
      flushParagraph();
      flushList();
      continue;
    }

    // The rule line has no pipe at its ends when written as ---|---, so it joins a table already
    // started rather than having to look like a row itself.
    // The paragraph before it is held until the rows turn out to be a table or not.
    if (TABLE_ROW.test(line) || (table.length === 1 && TABLE_RULE.test(line))) {
      flushList();
      table.push(line);
      continue;
    }
    flushTable();

    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);

    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      // A change of list style starts a new list rather than silently merging the two.
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { items: [], ordered };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushTable();
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * The answer's opening line as its headline, when it wrote one.
 *
 * The model often opens with one bolded sentence that is the answer in brief — "**Mostly the
 * trades after your third of the day.**" — and the approved design draws that as the card's
 * title. Only a paragraph that is that bold run and nothing else counts: a sentence with one bold
 * phrase in it is still a sentence, and a bolded figure is a figure. Nothing is invented when
 * there is no such line — the answer simply has no headline.
 */
export function splitHeadline(blocks: AnswerBlock[]): { headline: string | null; rest: AnswerBlock[] } {
  const first = blocks[0];
  if (first?.kind === 'paragraph') {
    const parts = first.segments.filter((s) => s.kind !== 'text' || s.text.trim());
    if (parts.length === 1 && parts[0].kind === 'bold' && parts[0].text.trim()) {
      return { headline: parts[0].text.trim(), rest: blocks.slice(1) };
    }
  }
  return { headline: null, rest: blocks };
}
