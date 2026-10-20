import type { ReactNode } from 'react';
import type { Finding } from '../../utils/assistantOpening';
import type { AssistantChat } from '../../hooks/useAssistantChat';
import { NotesSwitch } from './AssistantParts';
import { FIGURE_TONE } from './assistantStyle';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] py-[7px] text-[13px] first:border-t-0">
      <span className="text-[12.5px] text-text-secondary">{label}</span>
      <span className="min-w-0 truncate text-right text-text-primary">{children}</span>
    </div>
  );
}

/**
 * The right of the three columns: what the assistant can see, the starting points once a
 * conversation has pushed them off the middle, and the line about what it will not do.
 *
 * "What it can see" is the answer to the question every trader has about a tool like this —
 * which journal, which dates, whether it reads my notes — and the answer is taken from exactly
 * what the hook hands the model: the period's facts, the notes opt-in, the rules it was given.
 */
export function AssistantRail({
  chat,
  journal,
  net,
  rules,
  className = '',
}: {
  chat: AssistantChat;
  journal: string;
  /** The period's net, formatted, with its colour. */
  net: ReactNode;
  /** The rules handed to the assistant, one sentence each. */
  rules: string[];
  className?: string;
}) {
  const { active, compare, facts, chatLocked, shareNotes, setShareNotes, findings, messages, busy } = chat;
  return (
    <aside className={`min-h-0 flex-col gap-4 overflow-y-auto no-scrollbar ${className}`}>
      <section className="panel-card rounded-[14px] p-4">
        <h2 className="mb-1.5 text-sm font-semibold">What it can see</h2>
        <Fact label="Journal">{journal}</Fact>
        <Fact label="Period">{active?.label ?? '—'}</Fact>
        {compare && <Fact label="Compared with">{compare.label}</Fact>}
        <Fact label="Trades">
          <span className="tabular-nums">
            {facts?.tradeCount ?? 0}
            {facts && <> · {net}</>}
          </span>
        </Fact>
        {/* The opt-in only changes what is sent, so it goes with the chat. */}
        {!chatLocked && (
          <Fact label="Your notes">
            <NotesSwitch on={shareNotes} onChange={setShareNotes} />
          </Fact>
        )}
        <p className="mt-2 text-xs text-text-secondary">Your rules</p>
        {rules.length > 0 ? (
          rules.map((line) => (
            <p key={line} className="flex gap-2 py-[5px] text-[12.5px] text-text-secondary">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
              {line}
            </p>
          ))
        ) : (
          <p className="py-[5px] text-[12.5px] text-text-secondary/70">None it can check against</p>
        )}
      </section>

      {/* In the middle until the first question, then here — on screen once, never twice. */}
      {messages.length > 0 && findings.length > 0 && (
        <section className="panel-card rounded-[14px] p-4">
          <h2 className="mb-1.5 text-sm font-semibold">Starting points</h2>
          {findings.map((f) => (
            <RailFinding key={f.headline} finding={f} disabled={busy} onAsk={() => chat.ask(f.question, f.headline)} />
          ))}
        </section>
      )}

      <p className="text-xs leading-normal text-text-secondary/70">
        It reads the figures your journal already computed, so it can&apos;t disagree with your
        dashboard. It reviews what you did — it never tells you what to trade next.
      </p>
    </aside>
  );
}

function RailFinding({ finding, disabled, onAsk }: { finding: Finding; disabled: boolean; onAsk: () => void }) {
  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={disabled}
      className="group block w-full border-t border-white/[0.06] py-2.5 text-left text-[13px] leading-snug first-of-type:border-t-0 first-of-type:pt-0.5 focus-ring disabled:opacity-50"
    >
      {finding.figure ? (
        <>
          <span className={`font-bold tabular-nums ${FIGURE_TONE[finding.tone]}`}>{finding.figure}</span> {finding.lead}.
        </>
      ) : (
        <span className="font-semibold">{finding.lead}.</span>
      )}
      <span className="mt-[3px] block text-xs text-accent">
        Ask about this <span aria-hidden className="inline-block motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5">→</span>
      </span>
    </button>
  );
}
