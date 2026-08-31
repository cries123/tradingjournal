interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** full = stacked logo.svg · compact = mark + stacked wordmark · row = mark + one-line wordmark · mark = icon only */
  variant?: 'full' | 'compact' | 'row' | 'mark';
}

const markHeights = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
};

/**
 * The row lockup carries its own mark sizes because it lives inside a fixed-height bar.
 *
 * Every other lockup here is three lines tall — TREND / CHASERS / tagline — so a header that wants
 * one of them legible has to be three lines tall as well. That is exactly how the nav ended up at
 * 128px. Set on one line beside a 40px mark, the wordmark still reads at a glance and fits a
 * normal 72px header with room left over.
 */
const rowMark = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9 sm:h-10 sm:w-10',
  lg: 'h-11 w-11',
};

const rowText = {
  sm: { title: 'text-[11px]', gap: 'gap-2' },
  md: { title: 'text-xs sm:text-sm', gap: 'gap-2 sm:gap-2.5' },
  lg: { title: 'text-sm sm:text-base', gap: 'gap-3' },
};

const fullHeights = {
  sm: 'h-20 max-w-[140px]',
  md: 'h-24 max-w-[168px]',
  lg: 'h-28 sm:h-32 md:h-36 max-w-[240px] md:max-w-none',
};

const compactText = {
  sm: { title: 'text-[11px]', sub: 'text-[9px]', gap: 'gap-2' },
  md: { title: 'text-xs sm:text-sm', sub: 'text-[10px] sm:text-xs', gap: 'gap-2.5' },
  lg: { title: 'text-sm sm:text-base', sub: 'text-xs sm:text-sm', gap: 'gap-3' },
};

export function BrandLogo({ size = 'md', variant = 'compact' }: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src="/logo-mark.svg"
        alt="Trend Chasers"
        className={`${markHeights[size]} shrink-0 object-contain`}
      />
    );
  }

  if (variant === 'full') {
    return (
      <img
        src="/logo.svg"
        alt="Trend Chasers"
        className={`${fullHeights[size]} w-auto shrink-0 object-contain object-left`}
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = '/logo-mark.svg';
        }}
      />
    );
  }

  if (variant === 'row') {
    const row = rowText[size];
    return (
      /* Spans, not divs: this renders inside the nav's <a>, and a block element in there is the
         kind of thing that quietly breaks the click target's own layout. */
      <span className={`inline-flex items-center ${row.gap} shrink-0 w-fit`}>
        <img
          src="/logo-mark.svg"
          alt=""
          aria-hidden
          className={`${rowMark[size]} shrink-0 object-contain`}
        />
        <span
          className={`${row.title} font-black tracking-[0.14em] leading-none whitespace-nowrap`}
        >
          <span className="text-[#6cd59f]">TREND</span>{' '}
          <span className="text-text-primary">CHASERS</span>
        </span>
      </span>
    );
  }

  const text = compactText[size];
  return (
    <div className={`inline-flex items-center justify-start ${text.gap} shrink-0 w-fit`}>
      <img
        src="/logo-mark.svg"
        alt=""
        aria-hidden
        className={`${markHeights[size]} shrink-0 object-contain object-left`}
      />
      <div className="min-w-0 leading-none">
        <p className={`${text.title} font-black tracking-[0.14em] text-[#6cd59f]`}>TREND</p>
        <p className={`${text.title} font-black tracking-[0.14em] text-text-primary mt-0.5`}>CHASERS</p>
        <p className={`${text.sub} text-[#8e939d] mt-1`}>Track · Analyze · Improve</p>
      </div>
    </div>
  );
}
