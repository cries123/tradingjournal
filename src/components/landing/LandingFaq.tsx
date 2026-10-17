import { Mail, Plus } from 'lucide-react';
import { FadeIn } from '../motion/FadeIn';
import { LANDING_FAQ } from '../../seo/faq';

const SUPPORT_EMAIL = 'support@trendchasers.net';

/**
 * The landing page's FAQ.
 *
 * It was one 768px column of eight closed rows in the middle of a 1900px screen — a third of the
 * width used and the rest starfield. On a wide screen it is now a heading that stays put on the left
 * and the questions in two columns beside it, so all eight are readable without scrolling past a
 * strip of empty space. The questions go down the first column and then the second, rather than
 * across in rows, so the reading order a screen reader follows is the one the numbers show.
 *
 * The first answer starts open: eight closed rows read as a list of headings, and one open answer
 * shows straight away that each of them opens.
 *
 * The questions and answers come from LANDING_FAQ, which is also the page's FAQPage markup — so the
 * text a visitor reads and the text Google shows cannot drift apart.
 */
export function LandingFaq() {
  const half = Math.ceil(LANDING_FAQ.length / 2);
  const columns = [LANDING_FAQ.slice(0, half), LANDING_FAQ.slice(half)];

  const help = (
    <div className="glass-card rounded-xl p-5 flex items-start gap-4 text-left">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
        <Mail size={18} aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-sm">Still have a question?</p>
        <p className="mt-1 text-sm text-slate-300/85 leading-relaxed">
          Email{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-accent hover:text-accent underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          and ask us about your setup.
        </p>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1680px] mx-auto px-4 md:px-6 grid lg:grid-cols-12 gap-10 lg:gap-12 xl:gap-16">
      <div className="lg:col-span-4">
        <div className="lg:sticky lg:top-28">
          <FadeIn className="text-center lg:text-left">
            <h2 className="public-display text-4xl md:text-5xl">Common questions</h2>
            <p className="mt-3 text-text-secondary text-sm md:text-base leading-relaxed max-w-md mx-auto lg:mx-0">
              Straight answers on broker sync, pricing, and where your trades are kept.
            </p>
          </FadeIn>
          {/* On a phone this sits under the questions instead, where someone who did not find their
              answer has just finished looking. */}
          <FadeIn className="hidden lg:block mt-8" delay={100}>
            {help}
          </FadeIn>
        </div>
      </div>

      <div className="lg:col-span-8">
        <div className="grid xl:grid-cols-2 gap-3 xl:gap-4 items-start">
          {columns.map((column, c) => (
            <div key={c} className="space-y-3 xl:space-y-4">
              {column.map((item, j) => {
                const n = c * half + j;
                return (
                  <FadeIn key={item.question} delay={n * 50}>
                    <details className="faq-item glass-card spotlight rounded-xl group" open={n === 0}>
                      <summary className="flex cursor-pointer list-none items-start gap-4 px-5 py-4 md:py-5">
                        <span className="hidden sm:block w-6 shrink-0 pt-px font-mono text-xs tabular-nums text-accent/80">
                          {String(n + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 font-medium text-[15px] md:text-base leading-snug">{item.question}</span>
                        <span
                          aria-hidden
                          className="grid h-7 w-7 shrink-0 -my-0.5 place-items-center rounded-full border border-border/60 text-text-secondary transition-[transform,color,border-color] duration-300 motion-reduce:transition-none group-open:rotate-45 group-open:border-accent/40 group-open:text-accent"
                        >
                          <Plus size={14} />
                        </span>
                      </summary>
                      <p className="px-5 sm:pl-15 pr-6 md:pr-16 pb-5 -mt-1 text-sm md:text-[15px] text-slate-300/85 leading-relaxed">
                        {item.answer}
                      </p>
                    </details>
                  </FadeIn>
                );
              })}
            </div>
          ))}
        </div>
        <FadeIn className="lg:hidden mt-8">{help}</FadeIn>
      </div>
    </div>
  );
}
