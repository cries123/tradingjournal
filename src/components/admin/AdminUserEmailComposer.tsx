import { useState } from 'react';
import { Send } from 'lucide-react';
import { ADMIN_MESSAGE_LIMITS } from '../../config/adminMessage';
import { adminEmailUser } from '../../services/adminUserManagement';

interface AdminUserEmailComposerProps {
  uid: string;
  email: string;
  /** Used to fill the templates in: "@chelo618" beats "there". */
  displayName: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onAudit: (action: 'user.emailed', detail: string) => void;
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
      `Hi ${name},\n\nThe issue you ran into has been fixed and is live now. If you still see it, reply to this email and we'll take another look.\n\nThanks for reporting it.`,
  },
  {
    id: 'syncs',
    label: 'Gave syncs back',
    subject: "Your syncs are back",
    body: (name) =>
      `Hi ${name},\n\nWe've put back the syncs you lost and added a few extra so you're not out of pocket. The fix behind it is live too.\n\nThanks for your patience.`,
  },
];

/**
 * A note to the account holder, sent from support@ so a reply comes back to the inbox that can
 * answer it. Templates are starting points, not canned mail — the text is editable right up to
 * Send, and what was sent goes into the audit trail by subject.
 */
export function AdminUserEmailComposer({ uid, email, displayName, onDone, onError, onAudit }: AdminUserEmailComposerProps) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = Boolean(email) && subject.trim().length > 0 && body.trim().length > 0 && !sending;

  const send = async () => {
    setSending(true);
    try {
      const { message } = await adminEmailUser(uid, subject, body);
      onDone(message);
      onAudit('user.emailed', subject.trim());
      setSubject('');
      setBody('');
      setOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not send the email');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={!email}
        onClick={() => setOpen(true)}
        title={email ? `Email ${email}` : 'No email on file'}
        className="w-full flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm disabled:opacity-50"
      >
        <Send size={15} />
        Email this user
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-text-primary">To {email}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

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
        maxLength={ADMIN_MESSAGE_LIMITS.subject}
        placeholder="Subject"
        className="input-field text-sm w-full"
        aria-label="Subject"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={ADMIN_MESSAGE_LIMITS.body}
        rows={6}
        placeholder="Write it like a person. Blank lines make paragraphs."
        className="input-field text-sm w-full resize-y min-h-[120px]"
        aria-label="Message"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-text-secondary">
          From Trend Chasers &lt;support@trendchasers.net&gt; · replies go to support
        </p>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => void send()}
          className="inline-flex items-center gap-1.5 btn-secondary px-3 py-1.5 text-xs shrink-0 disabled:opacity-50"
        >
          <Send size={13} aria-hidden />
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
