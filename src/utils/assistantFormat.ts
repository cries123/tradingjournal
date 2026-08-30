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
  | { kind: 'list'; items: AnswerSegment[][]; ordered: boolean };

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

/** Splits on **bold**, then finds figures inside whatever is left. */
export function parseInline(line: string): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  let last = 0;
  for (const match of line.matchAll(/\*\*(.+?)\*\*/g)) {
    const at = match.index ?? 0;
    if (at > last) out.push(...splitFigures(line.slice(last, at)));
    out.push({ kind: 'bold', text: match[1] });
    last = at + match[0].length;
  }
  if (last < line.length) out.push(...splitFigures(line.slice(last)));
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseAnswer(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;

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

  for (const raw of answer.split('\n')) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

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

  flushParagraph();
  flushList();
  return blocks;
}
