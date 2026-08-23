import { LegalPageLayout } from './LegalPageLayout';

interface PrivacyPolicyPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
}

export function PrivacyPolicyPage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers }: PrivacyPolicyPageProps) {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="August 23, 2026" onHome={onHome} onLaunch={onLaunch} onPrivacy={onPrivacy} onTerms={onTerms} onBrokers={onBrokers}>
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
          available and requires no connection at all. If you choose to connect Schwab or Robinhood for
          automatic sync, we use SnapTrade, a third-party broker-data connection provider, to broker that
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
        </ul>
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
        <h2>Third-party services</h2>
        <ul>
          <li><strong>Firebase</strong> — authentication and cloud storage (Google).</li>
          <li><strong>SnapTrade</strong> — brokers the read-only connection to Schwab or Robinhood when you choose to connect a broker. See SnapTrade&apos;s own privacy policy for how they handle your brokerage credentials.</li>
          <li><strong>Netlify</strong> — hosting and serverless functions for the app and broker-sync API.</li>
        </ul>
        <p>These providers process data according to their own privacy policies.</p>
      </section>

      <section>
        <h2>Cookies and local storage</h2>
        <p>
          We use browser local storage to save your trades and preferences. Firebase may use cookies or
          similar technologies for authentication sessions.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          You can delete trades from the app, clear all data, or delete your Firebase account through
          Firebase/Google account settings. For questions or deletion requests, email{' '}
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
