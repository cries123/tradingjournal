import { LegalPageLayout } from './LegalPageLayout';
import { LEGAL_ENTITY, REFUND_WINDOW_DAYS, SUPPORT_EMAIL } from '../config/legal';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface RefundPolicyPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

/**
 * The refund policy.
 *
 * Written to be unconditional on purpose. Processors reject policies with qualifiers in them —
 * "processing fees may apply", "at our discretion", "subject to review" — because a conditional
 * refund promise pushes disputes onto them as chargebacks. "No questions asked" is both the
 * language they want to see and the policy that produces the fewest chargebacks, which is the
 * same reason they want it.
 */
export function RefundPolicyPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: RefundPolicyPageProps) {
  return (
    <LegalPageLayout
      title="Refund Policy"
      lastUpdated="August 30, 2026"
      onHome={onHome}
      onLaunch={onLaunch}
      onPrivacy={onPrivacy}
      onTerms={onTerms}
      onBrokers={onBrokers}
      onGuides={onGuides}
      onNavigate={onNavigate}
    >
      <section>
        <h2>{REFUND_WINDOW_DAYS}-day money-back guarantee</h2>
        <p>
          If you are not happy with a paid Trend Chasers plan for any reason, email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> within {REFUND_WINDOW_DAYS} days of
          your payment and we will refund it in full. No questions asked, no conditions, no fees
          deducted.
        </p>
        <p>
          You do not need to explain why. You do not need to have stopped using the app. Tell us the
          email address on the account and we will process it.
        </p>
      </section>

      <section>
        <h2>How long it takes</h2>
        <p>
          Refunds are issued within 5 business days of your request. Once issued, the money takes a
          further 5 to 10 business days to appear, depending on your bank or card issuer — that part
          is outside our control.
        </p>
      </section>

      <section>
        <h2>Cancelling</h2>
        <p>
          You can cancel a subscription at any time from the billing link in Settings. Cancelling
          stops all future charges immediately.
        </p>
        <p>
          Your plan stays active until the end of the period you have already paid for. After that
          your account returns to the free plan.
        </p>
      </section>

      <section>
        <h2>What happens to your trades</h2>
        <p>
          Nothing. Your journal, notes, screenshots and history belong to you and are never deleted
          because a subscription ended.
        </p>
        <p>
          On the free plan you keep full access to manual logging, your P&amp;L calendar and all
          analytics. Broker connections and the AI assistant stop until you subscribe again, and
          everything already imported stays exactly where it is. You can also export your entire
          journal at any time from Settings, on any plan.
        </p>
      </section>

      <section>
        <h2>Renewals</h2>
        <p>
          Subscriptions renew monthly at the price shown when you subscribed. If a renewal charge
          catches you by surprise, the {REFUND_WINDOW_DAYS}-day guarantee above applies to it just as
          it does to a first payment — email us and we will refund it.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Trend Chasers is operated by {LEGAL_ENTITY}. For any question about billing, refunds or
          cancellation, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We answer
          every message.
        </p>
      </section>
    </LegalPageLayout>
  );
}
