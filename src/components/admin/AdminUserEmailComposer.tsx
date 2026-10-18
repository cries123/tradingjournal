import { useState } from 'react';
import { Inbox, Mail, MessageSquare, Send } from 'lucide-react';
import { ADMIN_MESSAGE_LIMITS, SUPPORT_THREAD_LIMITS } from '../../config/adminMessage';
import { adminEmailUser, adminOpenSupportThread } from '../../services/adminUserManagement';
import { SegmentedControl } from '../ui/SegmentedControl';

type Channel = 'support' | 'email';

interface AdminUserEmailComposerProps {
  uid: string;
  email: string;
  /** Used to fill the templates in: "@chelo618" beats "there". */
  displayName: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onAudit: (action: 'user.emailed' | 'user.support-message-sent', detail: string) => void;
}

interface Template {
  id: string;
  label: string;
  subject: string;
  body: (name: string) => string;
}

const TEMPLATES: Template[] = [
  {
    id: 'comp',
    label: 'Added time to their plan',
    subject: "We've added time to your Trend Chasers plan",
    body: (name) =>
      `Hi ${name},\n\nWe've added extra time to your plan, on us. Nothing to do on your end — it's already on your account.\n\nThanks for sticking with us.`,
  },
  {
    id: 'fixed',
    label: 'Issue fixed',
    subject: 'The problem you reported is fixed',
    body: (name) =>
      `Hi ${name},\n\nThe issue you ran into has been fixed and is live now. If you still see it, reply here and we'll take another look.\n\nThanks for reporting it.`,
  },
  {
    id: 'sync-timeout',
    label: "Sync didn't import",
    subject: "Why your last sync didn't import",
    body: (name) =>
      `Hi ${name},\n\nYour last broker sync found your trades but ran out of time before they reached your journal, so nothing was imported. That's on our side, not yours, and we've given the sync back.\n\nA fix is on the way. We'll message you here as soon as it's live so you can sync again.`,
  },
  {
    id: 'syncs',
    label: 'Gave syncs back',
    subject: 'Your syncs are back',
    body: (name) =>
      `Hi ${name},\n\nWe've put back the syncs you lost and added a few extra so you're not out of pocket. The fix behind it is live too.\n\nThanks for your patience.`,
  },
];

const CHANNELS = [
  { id: 'support' as const, label: 'Support inbox', icon: Inbox },
  { id: 'email' as const, label: 'Email only', icon: Mail },
];

/**
 * A note to the account holder, either as a conversation in their Support inbox or as a plain
 * email from support@.
 *
 * The inbox is the default because it keeps the conversation in the product: it lights the badge
 * on their sidebar, they reply in the same thread every support conversation uses, and it emails
 * them a short notice so they know to look. Email only is for somebody who cannot get into the app
 * — a sign-in problem, a deleted journal — where a message waiting inside it would never be read.
 *
 * Templates are starting points, not canned mail — the text is editable right up to Send, and what
 * was sent goes into the audit trail by subject.
 */
export function AdminUserEmailComposer({ uid, email, displayName, onDone, onError, onAudit }: AdminUserEmailComposerProps) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>('support');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  /*
   * The result, reported HERE as well as to the parent.
   *
   * The parent's banner lives at the bottom of the Account section — past the password reset, the
   * change-email box, the set-password box and the delete button. This composer is the first
   * control in that section, so on a phone the answer to "did it send?" landed several screens
   * below the button that asked, and pressing Send looked like it did nothing at all. Both a
   * failure and a success were invisible.
   */
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // The inbox thread follows the ticket rules' own bounds; email allows a little more.
  const limits = channel === 'support' ? SUPPORT_THREAD_LIMITS : ADMIN_MESSAGE_LIMITS;
  const subjectOk = channel === 'support' ? subject.trim().length >= SUPPORT_THREAD_LIMITS.subjectMin : subject.trim().length > 0;
  const canSend =
    (channel === 'support' || Boolean(email)) &&
    subjectOk &&
    subject.trim().length <= limits.subject &&
    body.trim().length > 0 &&
    body.trim().length <= limits.body &&
    !sending;

  const send = async () => {
    setSending(true);
    setFailed(null);
    setSent(null);
    try {
      const { message } =
        channel === 'support'
          ? await adminOpenSupportThread(uid, subject, body)
          : await adminEmailUser(uid, subject, body);
      onDone(message);
      onAudit(channel === 'support' ? 'user.support-message-sent' : 'user.emailed', subject.trim());
      setSubject('');
      setBody('');
      // The form stays open on success, showing what happened. Collapsing it the instant the send
      // worked is the other half of why this felt like nothing: the composer vanished and the only
      // confirmation was off-screen.
      setSent(message);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not send that';
      setFailed(text);
      onError(text);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm"
      >
        <MessageSquare size={15} />
        Message this user
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl options={CHANNELS} value={channel} onChange={setChannel} label="Send as" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

      <p className="text-[11px] text-text-secondary leading-relaxed">
        {channel === 'support'
          ? `Opens a conversation in ${displayName}'s Support inbox, lights the badge in their sidebar, and emails them a short notice. They reply in the app.`
          : email
            ? `Sends an email to ${email} from support@trendchasers.net. Replies come back to the support inbox.`
            : 'No email on file for this account. Send it to their Support inbox instead.'}
      </p>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSubject(t.subject);
              setBody(t.body(displayName));
            }}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:border-slate-500 transition-colors"
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        maxLength={limits.subject}
        placeholder="Subject"
        className="input-field text-sm w-full"
        aria-label="Subject"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={limits.body}
        rows={6}
        placeholder="Write it like a person. Blank lines make paragraphs."
        className="input-field text-sm w-full resize-y min-h-[120px]"
        aria-label="Message"
      />

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={!canSend}
          onClick={() => void send()}
          className="inline-flex items-center gap-1.5 btn-secondary px-3 py-1.5 text-xs shrink-0 disabled:opacity-50"
        >
          <Send size={13} aria-hidden />
          {sending ? 'Sending…' : channel === 'support' ? 'Send to their inbox' : 'Send email'}
        </button>
      </div>

      {/* Directly under the button that caused it. */}
      {failed && <p className="text-[11px] text-red-400">{failed}</p>}
      {sent && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-accent">{sent}</p>
          <button
            type="button"
            onClick={() => {
              setSent(null);
              setOpen(false);
            }}
            className="text-[11px] text-text-secondary hover:text-text-primary shrink-0 focus-ring rounded"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
