interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  variant?: 'horizontal' | 'stacked';
}

const sizes = {
  sm: { mark: 'h-7 w-7', stacked: 'h-16', title: 'text-[11px]', sub: 'text-[9px]', gap: 'gap-2' },
  md: { mark: 'h-8 w-8', stacked: 'h-[4.5rem]', title: 'text-xs', sub: 'text-[10px]', gap: 'gap-2.5' },
  lg: { mark: 'h-10 w-10', stacked: 'h-28', title: 'text-sm', sub: 'text-xs', gap: 'gap-3' },
};

export function BrandLogo({ size = 'md', showText = true, variant = 'horizontal' }: BrandLogoProps) {
  const s = sizes[size];

  if (!showText) {
    return <img src="/logo-mark.svg" alt="Trend Chasers" className={`${s.mark} shrink-0`} />;
  }

  if (variant === 'stacked') {
    return (
      <img
        src="/logo.svg"
        alt="Trend Chasers"
        className={`${s.stacked} w-auto shrink-0 object-contain`}
      />
    );
  }

  return (
    <div className={`flex items-center ${s.gap} min-w-0`}>
      <img src="/logo-mark.svg" alt="" aria-hidden className={`${s.mark} shrink-0`} />
      <div className="min-w-0 leading-none">
        <p className={`${s.title} font-extrabold tracking-[0.12em] text-emerald-400`}>TREND</p>
        <p className={`${s.title} font-extrabold tracking-[0.12em] text-text-primary mt-0.5`}>CHASERS</p>
        <p className={`${s.sub} text-text-secondary mt-1 tracking-wide`}>Track · Analyze · Improve</p>
      </div>
    </div>
  );
}
