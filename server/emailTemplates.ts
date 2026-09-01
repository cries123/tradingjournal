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
