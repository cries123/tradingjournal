interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** full = stacked logo.svg · compact = mark + wordmark · mark = icon only */
  variant?: 'full' | 'compact' | 'mark';
}

const markHeights = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
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
      />
    );
  }

  const text = compactText[size];
  return (
    <div className={`flex items-center ${text.gap} min-w-0 max-w-full`}>
      <img src="/logo-mark.svg" alt="" aria-hidden className={`${markHeights[size]} shrink-0 object-contain`} />
      <div className="min-w-0 leading-none">
        <p className={`${text.title} font-black tracking-[0.14em] text-[#6cd59f]`}>TREND</p>
        <p className={`${text.title} font-black tracking-[0.14em] text-text-primary mt-0.5`}>CHASERS</p>
        <p className={`${text.sub} text-[#8e939d] mt-1`}>Track · Analyze · Improve</p>
      </div>
    </div>
  );
}
