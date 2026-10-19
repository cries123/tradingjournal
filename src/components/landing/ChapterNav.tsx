import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, chapterProgress, currentChapter } from './chapters';

/**
 * The bar that says where you are in "how it works": Connect, See, Fix.
 *
 * The page used to be a run of sections in no particular order; a reader could not tell how much was
 * left or what came next. The three chapters are the order the product is used in, numbered because
 * they are a sequence, and the bar sticks under the site header only while the chapters are on screen
 * — it lives inside their wrapper, so it leaves with them.
 *
 * The line under it fills as the reader goes. It is written straight to a CSS variable rather than
 * through state, so scrolling never re-renders the page; the chapter names change state only when the
 * chapter does.
 */
export function ChapterNav() {
  const barRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const sections = CHAPTERS.map((c) => document.getElementById(c.id));
      if (sections.some((s) => !s)) return;
      const rects = sections.map((s) => (s as HTMLElement).getBoundingClientRect());
      const y = window.scrollY;
      const p = chapterProgress(y, window.innerHeight, rects[0].top + y, rects[rects.length - 1].bottom + y);
      barRef.current?.style.setProperty('--p', p.toFixed(3));
      const next = currentChapter(
        rects.map((r) => r.top),
        window.innerHeight,
      );
      setCurrent((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <nav
      aria-label="How it works"
      className="sticky top-16 z-20 border-b border-white/[0.06] bg-bg-primary/80 backdrop-blur-md sm:top-[72px]"
    >
      <div className="mx-auto flex h-[52px] max-w-[1240px] items-center gap-1 px-4 sm:h-[58px] sm:gap-2 md:px-8">
        {CHAPTERS.map((c, i) => {
          const on = i === current;
          return (
            <a
              key={c.id}
              href={`#${c.id}`}
              aria-current={on ? 'step' : undefined}
              className={`inline-flex h-[38px] items-center gap-2.5 rounded-full pl-1.5 pr-3.5 text-[15px] font-semibold transition-colors focus-ring sm:pl-2 sm:pr-4 ${
                on ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <b
                className={`grid h-6 w-6 place-items-center rounded-full border text-xs ${
                  on ? 'border-accent bg-accent text-black' : 'border-white/[0.12]'
                }`}
              >
                {i + 1}
              </b>
              {c.label}
            </a>
          );
        })}
        <span className="ml-auto hidden text-[13px] text-text-secondary/70 md:inline">How Trend Chasers works, in three steps</span>
      </div>
      <div
        ref={barRef}
        aria-hidden
        className="chapter-progress absolute bottom-[-1px] left-0 h-0.5 w-full bg-accent shadow-[0_0_12px_rgba(122,255,69,0.8)]"
      />
    </nav>
  );
}
