/* Brand marks drawn inline: lucide dropped its brand icons, and these two are the only ones needed. */

export function XIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.57L22.8 22h-6.9l-5.4-7.06L4.3 22H1l8.02-9.17L.6 2h7.07l4.88 6.45L18.24 2Zm-1.21 18h1.88L6.97 3.9H4.95L17.03 20Z" />
    </svg>
  );
}

export function DiscordIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.3 4.4A19.6 19.6 0 0 0 15.5 3l-.6 1.2a18 18 0 0 0-5.8 0L8.5 3a19.5 19.5 0 0 0-4.8 1.4C.6 9 .1 13.4.3 17.8a19.7 19.7 0 0 0 5.9 3l1.3-2.1a12.6 12.6 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4a12.6 12.6 0 0 1-2 1l1.3 2.1a19.6 19.6 0 0 0 5.9-3c.4-5-.9-9.4-3.4-13.4ZM8.5 15.2c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" />
    </svg>
  );
}
