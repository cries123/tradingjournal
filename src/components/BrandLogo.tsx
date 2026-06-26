interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const sizes = {
  sm: { icon: 'w-7 h-7 text-xs', title: 'text-sm', sub: 'text-[10px]' },
  md: { icon: 'w-8 h-8 text-sm', title: 'text-base', sub: 'text-xs' },
  lg: { icon: 'w-10 h-10 text-base', title: 'text-xl', sub: 'text-sm' },
};

export function BrandLogo({ size = 'md', showText = true }: BrandLogoProps) {
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${s.icon} rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-bg-primary shadow-lg shadow-emerald-500/20 shrink-0`}
      >
        TC
      </div>
      {showText && (
        <div className="min-w-0">
          <p className={`${s.title} font-semibold tracking-tight text-text-primary leading-none`}>
            Trend Chasers
          </p>
          <p className={`${s.sub} text-text-secondary mt-0.5`}>Track · Analyze · Improve</p>
        </div>
      )}
    </div>
  );
}
