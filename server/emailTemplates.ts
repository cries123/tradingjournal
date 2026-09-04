import type { WeeklyRecap } from '../src/utils/insights';

/**
 * The two emails this product sends, as one small layout and two bodies.
 *
 * Table-based and fully inline-styled on purpose: Outlook ignores <style> blocks and most flexbox,
 * and an email that only renders in Gmail is an email half the list can't read. Dark backgrounds
 * are avoided for the same reason — several clients invert them and produce unreadable text.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutOptions {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
  unsubscribeUrl?: string | null;
}

function layout({ title, body, ctaLabel, ctaUrl, footerNote, unsubscribeUrl }: LayoutOptions): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e3e5e9;">
      <tr><td style="padding:24px 28px 8px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#0ea5e9;">Trend Chasers</p>
        <h1 style="margin:8px 0 0 0;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(title)}</h1>
      </td></tr>
      <tr><td style="padding:12px 28px 4px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#374151;">
        ${body}
      </td></tr>
      <tr><td style="padding:20px 28px 28px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <a href="${ctaUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 22px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
      </td></tr>
      <tr><td style="padding:0 28px 24px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;border-top:1px solid #eef0f3;padding-top:16px;">
        ${escapeHtml(footerNote)}${
          unsubscribeUrl
            ? ` &middot; <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>`
            : ''
        }
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/* ------------------------------------------------------------------ ticket reply */

export interface TicketReplyEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * "Support replied to your ticket."
 *
 * The reply itself is deliberately NOT quoted in full. A support thread can contain account
 * details the person would not choose to have sitting in an inbox, and email is the least private
 * place this product touches — so it carries a short preview and a link back to the thread.
 */
export function ticketReplyEmail(options: {
  ticketSubject: string;
  preview: string;
  siteUrl: string;
}): TicketReplyEmail {
  const link = `${options.siteUrl}/support`;
  const trimmed = options.preview.trim().replace(/\s+/g, ' ').slice(0, 180);
  const snippet = trimmed.length === 180 ? `${trimmed}…` : trimmed;

  const body = `
    <p style="margin:0 0 12px 0;">We've replied to your ticket <strong>${escapeHtml(options.ticketSubject)}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:3px solid #0ea5e9;border-radius:6px;margin:0 0 12px 0;">
      <tr><td style="padding:12px 14px;font-size:14px;line-height:1.55;color:#374151;">${escapeHtml(snippet)}</td></tr>
    </table>
    <p style="margin:0;">Open the ticket to read the full reply and write back — the whole conversation stays in one place.</p>`;

  const text = [
    `We've replied to your ticket "${options.ticketSubject}".`,
    '',
    snippet,
    '',
    `Read it and reply here: ${link}`,
    '',
    'Trend Chasers support',
  ].join('\n');

  return {
    subject: `Re: ${options.ticketSubject}`,
    html: layout({
      title: 'Support replied',
      body,
      ctaLabel: 'Open the ticket',
      ctaUrl: link,
      footerNote: 'You are getting this because you opened a support ticket on Trend Chasers.',
    }),
    text,
  };
}

/* ------------------------------------------------------------------ weekly recap */

function money(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function statRow(label: string, value: string, color = '#111827'): string {
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:#6b7280;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:${color};">${escapeHtml(value)}</td>
  </tr>`;
}

/**
 * The Sunday summary.
 *
 * Sent only to people who opted in, only when they actually traded that week — a recap of a week
 * with no trades is a guilt email, and the fastest way to teach somebody to ignore this sender.
 */
export function weeklyRecapEmail(options: {
  recap: WeeklyRecap;
  siteUrl: string;
  unsubscribeUrl?: string | null;
}): TicketReplyEmail {
  const { recap } = options;
  const green = recap.net >= 0;
  const color = green ? '#047857' : '#b91c1c';

  const delta =
    recap.prevNet === null
      ? null
      : recap.net - recap.prevNet;

  const rows = [
    statRow('Net P&L', money(recap.net), color),
    statRow('Trades', String(recap.tradeCount)),
    statRow('Green / red days', `${recap.greenDays} / ${recap.redDays}`),
    recap.bestDay ? statRow('Best day', `${recap.bestDay.date} · ${money(recap.bestDay.pnl)}`, '#047857') : '',
    recap.worstDay ? statRow('Worst day', `${recap.worstDay.date} · ${money(recap.worstDay.pnl)}`, '#b91c1c') : '',
    recap.topSetup ? statRow('Best setup', `${recap.topSetup.setup} · ${money(recap.topSetup.pnl)}`) : '',
    delta !== null
      ? statRow('vs last week', `${delta >= 0 ? '+' : ''}${money(delta)}`, delta >= 0 ? '#047857' : '#b91c1c')
      : '',
  ]
    .filter(Boolean)
    .join('');

  const body = `
    <p style="margin:0 0 14px 0;">Here's how your last seven days went.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows}
    </table>
    <p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;">Open the journal for the calendar, the equity curve and what your setups actually did.</p>`;

  const textRows = [
    `Net P&L: ${money(recap.net)}`,
    `Trades: ${recap.tradeCount}`,
    `Green/red days: ${recap.greenDays}/${recap.redDays}`,
    recap.bestDay ? `Best day: ${recap.bestDay.date} ${money(recap.bestDay.pnl)}` : '',
    recap.worstDay ? `Worst day: ${recap.worstDay.date} ${money(recap.worstDay.pnl)}` : '',
    recap.topSetup ? `Best setup: ${recap.topSetup.setup} ${money(recap.topSetup.pnl)}` : '',
  ].filter(Boolean);

  return {
    subject: `Your week: ${money(recap.net)} across ${recap.tradeCount} trade${recap.tradeCount === 1 ? '' : 's'}`,
    html: layout({
      title: 'Your trading week',
      body,
      ctaLabel: 'Open your journal',
      ctaUrl: `${options.siteUrl}/app`,
      footerNote: 'You turned on the weekly recap in your Trend Chasers settings.',
      unsubscribeUrl: options.unsubscribeUrl,
    }),
    text: [
      'Your trading week',
      '',
      ...textRows,
      '',
      `Open your journal: ${options.siteUrl}/app`,
      options.unsubscribeUrl ? `\nUnsubscribe: ${options.unsubscribeUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/* ------------------------------------------------------------------ a note from the team */

/**
 * A message written by hand in the admin panel — "we've added a month to your account", "the sync
 * problem you reported is fixed". Plain paragraphs, the person's own words, nothing quoted from
 * the account. The reply address is support, so answering it lands where a reply can be read.
 */
export function adminMessageEmail(options: {
  subject: string;
  message: string;
  siteUrl: string;
}): TicketReplyEmail {
  const paragraphs = options.message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const body = paragraphs
    .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return {
    subject: options.subject,
    html: layout({
      title: options.subject,
      body,
      ctaLabel: 'Open Trend Chasers',
      ctaUrl: `${options.siteUrl}/app`,
      footerNote: 'Sent by the Trend Chasers team. Reply to this email to reach support.',
    }),
    text: [
      options.subject,
      '',
      ...paragraphs.flatMap((p) => [p, '']),
      `Open Trend Chasers: ${options.siteUrl}/app`,
      '',
      'Sent by the Trend Chasers team. Reply to this email to reach support.',
    ].join('\n'),
  };
}

/* ------------------------------------------------------------------ broker link */

/**
 * The day a link goes, written the way a person would say it.
 *
 * Eastern because that is the clock everything else in this product runs on — the daily
 * allowances, the trading day, the reaper's own schedule.
 */
export function friendlyDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'shortly';
  return at.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** "your Schwab connection" when we know the brokerage, "your broker connection" when we don't. */
function connectionPhrase(institution: string | null): string {
  return institution ? `your ${institution} connection` : 'your broker connection';
}

/*
 * Both of these are transactional, not marketing: they describe something happening to the
 * person's account whether they want the news or not. So neither carries an unsubscribe link and
 * neither checks emailPrefs — a notice that the thing you connected is about to be disconnected
 * is not something anyone should be able to opt out of and then be surprised by.
 *
 * Both say, in the body and not in a footnote, that the journal is untouched. Take away the word
 * "disconnect" from someone who has a year of trades in here and it reads as "your data is being
 * deleted", which is the panicked support ticket this is meant to prevent.
 */

export function brokerLinkEndingEmail(options: {
  institution: string | null;
  removesOn: string;
  siteUrl: string;
}): TicketReplyEmail {
  const what = connectionPhrase(options.institution);
  const when = friendlyDate(options.removesOn);
  const link = `${options.siteUrl}/pricing`;

  const body = `
    <p style="margin:0 0 12px 0;">Your plan no longer includes broker sync, so ${escapeHtml(what)} is scheduled to be removed on <strong>${escapeHtml(when)}</strong>.</p>
    <p style="margin:0 0 12px 0;"><strong>Your trades are not going anywhere.</strong> Everything already in your journal stays exactly where it is — the calendar, your notes, your tags, your screenshots. This only removes the link to your brokerage, which is what stops new fills importing automatically.</p>
    <p style="margin:0;">Start a plan again before ${escapeHtml(when)} and nothing happens at all — the connection stays and syncing picks up where it left off. After that you would need to reconnect your broker, which takes about a minute.</p>`;

  const text = [
    `Your plan no longer includes broker sync, so ${what} is scheduled to be removed on ${when}.`,
    '',
    'Your trades are not going anywhere. Everything already in your journal stays exactly where it is — the calendar, your notes, your tags, your screenshots. This only removes the link to your brokerage, which is what stops new fills importing automatically.',
    '',
    `Start a plan again before ${when} and nothing happens at all — the connection stays and syncing picks up where it left off. After that you would need to reconnect your broker, which takes about a minute.`,
    '',
    `Plans: ${link}`,
  ].join('\n');

  return {
    subject: `${options.institution ?? 'Broker'} sync ends ${when}`,
    html: layout({
      title: `${connectionPhrase(options.institution).replace(/^your /, 'Your ')} ends ${when}`,
      body,
      ctaLabel: 'Keep syncing',
      ctaUrl: link,
      footerNote: 'You are getting this because you connected a brokerage to Trend Chasers.',
    }),
    text,
  };
}

export function brokerLinkRemovedEmail(options: {
  institution: string | null;
  siteUrl: string;
}): TicketReplyEmail {
  const what = connectionPhrase(options.institution);
  const link = `${options.siteUrl}/app`;

  const body = `
    <p style="margin:0 0 12px 0;">${escapeHtml(what.charAt(0).toUpperCase() + what.slice(1))} has been removed, because the plan that included broker sync has ended.</p>
    <p style="margin:0 0 12px 0;"><strong>Your journal is untouched.</strong> Every trade you have imported or logged is still there, with your notes and grading on it, and you can keep journaling by hand for as long as you like — that part is free and always has been.</p>
    <p style="margin:0;">Whenever you want automatic importing back, start a plan and reconnect your broker. It takes about a minute, and your existing trades will not be duplicated.</p>`;

  const text = [
    `${what.charAt(0).toUpperCase() + what.slice(1)} has been removed, because the plan that included broker sync has ended.`,
    '',
    'Your journal is untouched. Every trade you have imported or logged is still there, with your notes and grading on it, and you can keep journaling by hand for as long as you like — that part is free and always has been.',
    '',
    'Whenever you want automatic importing back, start a plan and reconnect your broker. It takes about a minute, and your existing trades will not be duplicated.',
    '',
    `Your journal: ${link}`,
  ].join('\n');

  return {
    subject: `${options.institution ?? 'Broker'} sync has been turned off`,
    html: layout({
      title: 'Your broker connection has been removed',
      body,
      ctaLabel: 'Open your journal',
      ctaUrl: link,
      footerNote: 'You are getting this because you connected a brokerage to Trend Chasers.',
    }),
    text,
  };
}
