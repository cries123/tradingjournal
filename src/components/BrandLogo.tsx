interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const heights = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-32',
};

export function BrandLogo({ size = 'md', showText = true }: BrandLogoProps) {
  const height = heights[size];
  const src = showText ? '/logo.svg' : '/logo-mark.svg';

  return (
    <img
      src={src}
      alt="Trend Chasers"
      className={`${height} w-auto shrink-0 object-contain object-left`}
    />
  );
}
