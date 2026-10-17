/**
 * Where Trend Chasers is, off the site. One list, read by the landing page's community section,
 * the footer, the Organization schema and the twitter:site meta, so a handle change is one edit.
 */
export const X_HANDLE = '@TrendChasersTM';
export const X_URL = 'https://x.com/TrendChasersTM';
export const DISCORD_URL = 'https://discord.gg/mqGZ32K8Cw';

export const SOCIAL_LINKS: { id: 'x' | 'discord'; name: string; url: string; blurb: string }[] = [
  { id: 'x', name: 'X', url: X_URL, blurb: 'Updates, new features and the odd trade from the founder’s own journal.' },
  { id: 'discord', name: 'Discord', url: DISCORD_URL, blurb: 'Ask a question, show a month, compare notes with other traders.' },
];
