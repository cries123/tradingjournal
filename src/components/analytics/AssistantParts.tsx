import { Lock } from 'lucide-react';
import { lowestTierWith, TIER_PLANS } from '../../config/tiers';
import { CHAT_PLAN_NAME } from '../../hooks/useAssistantChat';
import { goToPricing } from '../../utils/navigateToPath';

/**
 * Where the message box goes when the chat is not on this plan — in the dock and on the page.
 *
 * Says what the box would do and what it costs, and — once somebody has clicked a finding or a
 * question — names the thing they just tried to ask. "Ask about 'Your bigger positions are the
 * losing ones' on Gold" is an offer about their own trading; a padlock is a wall.
 */
export function ChatUpgrade({ wanted, className = '' }: { wanted: string | null; className?: string }) {
  const tier = lowestTierWith('aiAssistant');
  const plan = tier ? TIER_PLANS[tier] : null;
  return (
    <div className={`shrink-0 ${className}`}>
      <div
        key={wanted ?? 'idle'}
        className={`flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] p-3 ${
          wanted ? 'animate-msg-in' : ''
        }`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent" aria-hidden>
          <Lock size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary leading-snug">
            {wanted ? <>Ask about &ldquo;{wanted}&rdquo; on {CHAT_PLAN_NAME}</> : <>Ask follow-up questions on {CHAT_PLAN_NAME}</>}
          </p>
          {plan && (
            <p className="mt-0.5 text-xs text-text-secondary">
              {plan.limits.aiMessagesPerDay} questions a day about your own trades · from ${plan.price}/month
            </p>
          )}
        </div>
        {/* Its own row on a phone (and in the 400px dock): beside the text it squeezed the offer
            into four lines of two words each. */}
        <button type="button" onClick={goToPricing} className="btn-primary w-full sm:w-auto px-4 py-2 text-sm shrink-0 focus-ring">
          Upgrade to {CHAT_PLAN_NAME}
        </button>
      </div>
    </div>
  );
}

/** The assistant's mark on the page: the brand's initials, in the accent, sized to where it speaks. */
export function TcAvatar({ size }: { size: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-accent/15 font-extrabold text-accent ${
        size === 'sm'
          ? 'h-7 w-7 rounded-lg text-[13px]'
          : 'mx-auto h-12 w-12 rounded-[14px] text-base lg:h-[52px] lg:w-[52px] lg:rounded-[15px] lg:text-[17px]'
      }`}
    >
      TC
    </span>
  );
}

/**
 * Whether the assistant may read the trader's notes, as a switch.
 *
 * Off unless they turn it on — that has not changed. It is the same opt-in the button in the
 * chat's header flips; the rail draws it beside the other things the assistant can see.
 */
export function NotesSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Let it read my trade notes"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-[34px] shrink-0 items-center rounded-full motion-safe:transition-colors focus-ring ${
        on ? 'bg-accent' : 'bg-[#2a2a2a]'
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 h-4 w-4 rounded-full motion-safe:transition-[left,background-color] ${
          on ? 'left-4 bg-bg-primary' : 'left-0.5 bg-[#8a8a8a]'
        }`}
      />
    </button>
  );
}

/** The three dots while the first token is on its way. */
export function TypingDots() {
  return (
    <span className="flex items-center gap-1 pt-2" aria-label="Thinking">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="typing-dot h-1.5 w-1.5 rounded-full bg-accent/70"
          style={{ animationDelay: `${dot * 160}ms` }}
        />
      ))}
    </span>
  );
}
