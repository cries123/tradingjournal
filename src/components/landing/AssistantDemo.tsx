import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { demoInsights, demoJournal, HEAVY_DAY, LIGHT_DAY } from './landingDemo';
import { useInView } from '../../hooks/useInView';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

const QUESTION = 'Why am I red this period?';
/** Long enough to read as thinking, short enough that nobody scrolls past waiting. */
const THINKING_MS = 900;
const CHAR_MS = 14;

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * An example of the assistant answering, typed out when it scrolls into view.
 *
 * The section used to show four question chips and a sentence saying they were not examples, which
 * told a visitor what the assistant does without ever showing it do it. This shows the thing itself:
 * a question, a moment of thinking, and an answer that quotes figures. The figures are worked out
 * from the sample journal (demoInsights), so the answer agrees with the panels and the simulator
 * above it, and the card says it is an example. Under reduced motion the answer is simply there.
 */
export function AssistantDemo() {
  const answer = useMemo(() => {
    const d = demoInsights(demoJournal());
    return (
      `On your ${d.heavyDays} days with ${HEAVY_DAY} or more trades you lost ${money(d.heavyPnl)}. ` +
      `On the ${d.lightDays} days you kept to ${LIGHT_DAY} or fewer, you made ${money(d.lightPnl)}. ` +
      `Your first four trades of each day netted +${money(d.firstFourPnl)}; everything after the fourth ` +
      `cost ${money(d.afterFourthPnl)}. That is one habit, not a strategy problem — a four-trade cap ` +
      `would have turned the period green.`
    );
  }, []);

  const reduceMotion = usePrefersReducedMotion();
  const { ref, inView } = useInView(0.3);
  const [typed, setTyped] = useState(0);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (!inView || reduceMotion) return;
    let interval = 0;
    const think = window.setTimeout(() => setThinking(true), 0);
    const start = window.setTimeout(() => {
      setThinking(false);
      interval = window.setInterval(() => {
        setTyped((n) => {
          if (n >= answer.length) {
            window.clearInterval(interval);
            return n;
          }
          return n + 2;
        });
      }, CHAR_MS);
    }, THINKING_MS);
    return () => {
      window.clearTimeout(think);
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [inView, reduceMotion, answer.length]);

  const shownText = reduceMotion ? answer : answer.slice(0, typed);
  const done = reduceMotion || typed >= answer.length;

  return (
    <div ref={ref} className="glass-card glow-border-brand spotlight rounded-2xl p-5 md:p-6">
      <p className="text-xs uppercase tracking-widest text-text-secondary mb-4">
        Example answer <span className="normal-case tracking-normal text-text-secondary/70">· sample journal</span>
      </p>

      <div className="flex justify-end mb-3">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 border border-accent/25 px-4 py-2.5 text-sm text-accent">
          {QUESTION}
        </p>
      </div>

      <div className="flex gap-3">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
          <Sparkles size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-bg-primary/60 border border-border/60 px-4 py-3 text-sm leading-relaxed text-slate-200 min-h-[7.5rem]">
          {/* The full answer for screen readers at once; the typing is for the eye only. */}
          <span className="sr-only">{answer}</span>
          <span aria-hidden>
            {thinking && typed === 0 ? (
              <span className="inline-flex gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-text-secondary motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            ) : (
              <>
                {shownText}
                {!done && <span className="inline-block w-1.5 h-4 align-[-2px] ml-0.5 bg-accent/80 motion-safe:animate-pulse" />}
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
