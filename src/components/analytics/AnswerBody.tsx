import { parseAnswer, type AnswerSegment } from '../../utils/assistantFormat';

function Segments({ segments }: { segments: AnswerSegment[] }) {
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
            <span key={i} className={`font-semibold tabular-nums ${tone}`}>
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
 * read. There it is a size up and nearer white.
 */
const TEXT = {
  sm: 'text-[13px] leading-relaxed text-text-secondary',
  md: 'text-[14.5px] leading-7 text-text-primary/85',
} as const;

/** Renders an assistant answer as real paragraphs, lists and highlighted figures. */
export function AnswerBody({ answer, size = 'sm' }: { answer: string; size?: keyof typeof TEXT }) {
  const blocks = parseAnswer(answer);
  const text = TEXT[size];

  return (
    <div className={size === 'md' ? 'space-y-3' : 'space-y-2'}>
      {blocks.map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i} className={text}>
            <Segments segments={block.segments} />
          </p>
        ) : (
          <ul key={i} className={size === 'md' ? 'space-y-2' : 'space-y-1.5'}>
            {block.items.map((item, j) => (
              <li key={j} className={`flex gap-2.5 ${text}`}>
                <span
                  className={`shrink-0 rounded-full bg-accent/70 ${size === 'md' ? 'mt-[11px] h-1.5 w-1.5' : 'mt-[7px] h-1 w-1'}`}
                  aria-hidden
                />
                <span className="min-w-0">
                  {block.ordered && (
                    <span className="mr-1 font-semibold text-text-primary tabular-nums">
                      {j + 1}.
                    </span>
                  )}
                  <Segments segments={item} />
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
