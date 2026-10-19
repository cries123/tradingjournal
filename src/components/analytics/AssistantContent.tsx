import { useMemo, useState } from 'react';
import type { TradingRules } from '../../types/strategy';
import { useSettings } from '../../context/useSettings';
import { useAssistantChat, type AssistantPeriod } from '../../hooks/useAssistantChat';
import { useAssistantThreads } from '../../hooks/useAssistantThreads';
import { threadSource, type AssistantThread } from '../../utils/assistantThreads';
import { ruleLines } from '../../utils/assistantPeriod';
import { formatCurrency } from '../../utils/format';
import { AssistantHistory, ChatPlanCard } from './AssistantHistory';
import { AssistantConversation } from './AssistantConversation';
import { AssistantRail } from './AssistantRail';
import { SCREEN_HEIGHTS } from './assistantStyle';

interface AssistantContentProps {
  periods: AssistantPeriod[];
  rules?: TradingRules;
  /**
   * Kept for the shell, which hands every screen one. This screen has no back link: the sidebar
   * leads out on a desktop and the bottom bar on a phone, as on the Overview.
   */
  onBack: () => void;
  /** The opening findings without the chat, for a plan without the assistant — see useAssistantChat. */
  chatLocked?: boolean;
}

/**
 * The assistant, as a place rather than a bubble — drawn to the approved October 2026 design.
 *
 * Three columns on a desktop: the saved conversations with the day's allowance at their foot; the
 * conversation, with the period and its result across its top; and what the assistant can see —
 * the journal, the period, the trades, whether it may read the notes, the rules it checks — with
 * the sentence about what it will never do. Under 1,360px the third column goes (the header row
 * still carries the period, the figures, Compare and notes); under 1,024px it is the phone's
 * screen: "Ask", the period, the starting points and the box, the history behind a clock icon.
 *
 * The dock on the Overview is the same assistant (AssistantPanel): same facts, same guardrails,
 * same allowance, same saved conversations.
 *
 * Left out of the design because nothing behind them works yet: Pin, the pinned answers card and
 * thumbs up/down. Drawing them would be selling buttons that do nothing.
 */
export function AssistantContent({ periods, rules, chatLocked = false }: AssistantContentProps) {
  const chat = useAssistantChat({ periods, rules, chatLocked });
  const { selectThread, startNew } = useAssistantThreads();
  const { settings, viewingAllJournals } = useSettings();
  /** A phone shows one of the two at a time; a desktop shows both and ignores this. */
  const [view, setView] = useState<'chat' | 'history'>('chat');

  const currency = settings.currency ?? 'USD';
  const journal = viewingAllJournals
    ? 'All journals'
    : (settings.accounts?.find((a) => a.id === settings.activeAccountId)?.name ?? 'Your journal');
  const rulesSeen = useMemo(() => ruleLines(rules, currency), [rules, currency]);

  const netValue = chat.facts?.netPnl ?? 0;
  const net = (
    <span className={netValue < 0 ? 'text-loss-bright' : netValue > 0 ? 'text-profit-bright' : 'text-text-primary'}>
      {formatCurrency(netValue, currency)}
    </span>
  );

  /* Opening a conversation also moves to the period its last answer was about, when that period
     is still one on offer — a follow-up should be asked of the trades the conversation is about. */
  const openThread = (thread: AssistantThread) => {
    selectThread(thread.id);
    const source = threadSource(thread);
    const match = source ? periods.find((p) => p.label === source.period) : undefined;
    if (match) chat.setScope(match.scope);
    setView('chat');
  };

  const newChat = () => {
    startNew();
    setView('chat');
  };

  return (
    <div
      style={SCREEN_HEIGHTS}
      className="flex flex-col max-md:-mb-8 max-md:min-h-[var(--ask-phone-h)] md:-mb-11 md:min-h-[var(--ask-desk-h)] lg:h-[var(--ask-desk-h)] lg:min-h-[560px]"
    >
      <header className="mb-4 hidden shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.06] pb-3 pt-0.5 lg:flex">
        <h1 className="text-lg font-bold">Assistant</h1>
        <span className="text-[13px] text-text-secondary">Reviews your own trades with your journal&apos;s figures</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-4 min-[85rem]:grid-cols-[250px_minmax(0,1fr)_290px]">
        {chatLocked ? (
          <ChatPlanCard className="hidden lg:flex" />
        ) : (
          <AssistantHistory
            busy={chat.busy}
            onOpen={openThread}
            onNew={newChat}
            onClose={() => setView('chat')}
            className={view === 'history' ? 'flex flex-1 lg:flex-none' : 'hidden lg:flex'}
          />
        )}

        <AssistantConversation
          chat={chat}
          net={net}
          onHistory={() => setView('history')}
          onNew={newChat}
          className={view === 'history' && !chatLocked ? 'hidden lg:flex' : 'flex'}
        />

        <AssistantRail chat={chat} journal={journal} net={net} rules={rulesSeen} className="hidden min-[85rem]:flex" />
      </div>
    </div>
  );
}
