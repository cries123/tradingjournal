import { LegalPageLayout } from './LegalPageLayout';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface PrivacyPolicyPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function PrivacyPolicyPage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers, onGuides, onNavigate }: PrivacyPolicyPageProps) {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="October 1, 2026" onHome={onHome} onLaunch={onLaunch} onPrivacy={onPrivacy} onTerms={onTerms} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate}>
      <section>
        <h2>Overview</h2>
        <p>
          Trend Chasers (&quot;we,&quot; &quot;us,&quot; or &quot;the app&quot;) respects your privacy. This policy explains
          what information we collect, how we use it, and your choices — including if you choose to connect
          a brokerage account.
        </p>
      </section>

      <section>
        <h2>Connecting a broker is optional</h2>
        <p>
          You never have to connect a brokerage account to use Trend Chasers — manual trade entry is always
          available and requires no connection at all. If you choose to connect a supported brokerage to import
          your trades, we use SnapTrade, a third-party broker-data connection provider, to broker that
          connection. Your brokerage credentials are entered on your broker&apos;s own site or SnapTrade&apos;s
          secure connection portal — Trend Chasers never receives or stores your brokerage password.
          Connections are read-only by default: they can retrieve your trade history, but cannot place trades
          or move funds. You can disconnect a broker at any time from Connect broker in the app, which
          revokes SnapTrade&apos;s access immediately.
        </p>
      </section>

      <section>
        <h2>Information you provide</h2>
        <ul>
          <li><strong>Trade data</strong> — symbols, P/L, dates, notes, and other fields you enter manually or that sync in from a connected broker.</li>
          <li><strong>Account information</strong> — if you create an account, we store your email via Firebase Authentication.</li>
          <li><strong>Broker connection identifiers</strong> — if you connect a broker, we store the SnapTrade connection identifier needed to sync your account (a reference token, not your brokerage password) in our database, tied to your account.</li>
          <li><strong>A username</strong> — if you pick one. It is public on a track record you choose to publish, and nowhere else.</li>
          <li><strong>Support messages</strong> — anything you send through a support ticket or a bug report, with the email address you sent it from.</li>
        </ul>
        <p>
          A published track record is the one thing here that is public, and only if you publish it:
          it shows your username and the figures you chose to include. Taking it down removes it.
        </p>
      </section>

      <section>
        <h2>How we store data</h2>
        <p>
          Without an account, trades are stored locally in your browser. With an account, trades sync to
          Google Firebase Firestore under your user ID. You can sign out and continue using local storage only.
          Connecting a broker requires an account, since the connection is tied to your Trend Chasers user ID.
        </p>
      </section>

      <section>
        <h2>The assistant and your trades</h2>
        <p>
          If you use the trading assistant, the AI review or the period takeaway, a summary of your
          journal is sent to OpenAI to generate the answer. That summary is figures — totals, win rate,
          symbols, dates, sizes and the like — and it is only ever sent when you ask for one of those
          features; nothing is sent in the background.
        </p>
        <p>
          Your written notes are <strong>not</strong> included unless you switch on &quot;share my notes&quot;
          in the assistant. It is off until you turn it on, and turning it off stops them being sent again.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <ul>
          <li><strong>Firebase</strong> — authentication and cloud storage (Google).</li>
          <li><strong>SnapTrade</strong> — brokers the read-only connection to your brokerage when you choose to connect one. See SnapTrade&apos;s own privacy policy for how they handle your brokerage credentials.</li>
          <li><strong>Netlify</strong> — hosting and serverless functions for the app and broker-sync API.</li>
          <li><strong>OpenAI</strong> — generates the assistant&apos;s answers, the AI review and the period takeaway, from the journal summary described above.</li>
          <li><strong>Creem</strong> — takes payment and runs subscriptions if you buy a plan. Your card details go to them, never to us: we store only the customer and subscription reference they give back.</li>
          <li><strong>Resend</strong> — delivers the emails we send you, so they receive your address and the contents of the message.</li>
        </ul>
        <p>These providers process data according to their own privacy policies.</p>
      </section>

      <section>
        <h2>Cookies and local storage</h2>
        <p>
          We use browser local storage to save your trades and preferences. Firebase may use cookies or
          similar technologies for authentication sessions.
        </p>
        <p>
          We also count visits. A random identifier is stored in your browser so that returning is not
          counted as a new visitor, and we record which pages were opened and whether an account was
          created. It is not linked to you unless you create one, we do not use advertising or
          cross-site trackers, and clearing your browser storage clears the identifier.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          You can delete individual trades, clear a whole journal, or download a full backup of
          everything at any time from Settings.
        </p>
        <p>
          You can also delete the account itself — Account settings, Delete account. That removes your
          trades, notes, journals, settings, usernames, any published track record and the brokerage
          connection, and it cannot be undone. If you would rather we did it, or you have a question
          about any of this, email{' '}
          <a href="mailto:support@trendchasers.net" className="text-emerald-400 hover:underline">
            support@trendchasers.net
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may update this policy from time to time. Continued use of the app after changes constitutes
          acceptance of the updated policy.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about privacy, or a deletion request? Email{' '}
          <a href="mailto:support@trendchasers.net" className="text-emerald-400 hover:underline">
            support@trendchasers.net
          </a>
          , or use Report a bug in the site footer.
        </p>
      </section>
    </LegalPageLayout>
  );
}
