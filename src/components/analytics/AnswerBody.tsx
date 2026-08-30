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

/** Renders an assistant answer as real paragraphs, lists and highlighted figures. */
export function AnswerBody({ answer }: { answer: string }) {
  const blocks = parseAnswer(answer);

  return (
    <div className="space-y-2">
      {blocks.map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i} className="text-[13px] leading-relaxed text-text-secondary">
            <Segments segments={block.segments} />
          </p>
        ) : (
          <ul key={i} className="space-y-1.5">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-text-secondary">
                <span
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/70"
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
