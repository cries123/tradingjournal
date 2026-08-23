import { LegalPageLayout } from './LegalPageLayout';

interface TermsOfServicePageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
}

export function TermsOfServicePage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers }: TermsOfServicePageProps) {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="August 23, 2026" onHome={onHome} onLaunch={onLaunch} onPrivacy={onPrivacy} onTerms={onTerms} onBrokers={onBrokers}>
      <section>
        <h2>Agreement</h2>
        <p>
          By using Trend Chasers, you agree to these Terms of Service. If you do not agree, please do not
          use the app.
        </p>
      </section>

      <section>
        <h2>What this product is</h2>
        <p>
          Trend Chasers is a personal record-keeping tool for tracking trades and performance. It is not
          a broker, investment advisor, or financial institution. Nothing in the app constitutes financial,
          tax, or legal advice.
        </p>
      </section>

      <section>
        <h2>Broker connections</h2>
        <p>
          Connecting a brokerage account is optional. If you choose to connect Schwab or Robinhood, the
          connection is brokered by SnapTrade, a third-party service, and is read-only: it can retrieve your
          trade activity but cannot place trades, withdraw funds, or otherwise act on your account. You are
          responsible for reviewing synced trade data for accuracy — we do not guarantee that synced data
          exactly matches your brokerage&apos;s records, and you should verify against your broker&apos;s own
          statements. You can disconnect a broker at any time from within the app.
        </p>
      </section>

      <section>
        <h2>Manual entry</h2>
        <p>
          For trades you enter yourself, you are solely responsible for accuracy. We do not verify manually
          entered or synced trade data against any external source.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <p>
          If you create an account, you are responsible for keeping your login credentials secure. You must
          not use the service for unlawful purposes or attempt to access other users&apos; data.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          We strive to keep the app available but do not guarantee uninterrupted service. Features, broker
          import formats, and supported platforms may change or expand over time.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          Trend Chasers is provided &quot;as is&quot; without warranties. To the fullest extent permitted by law,
          we are not liable for trading losses, data loss, or damages arising from use of the app. You trade
          at your own risk.
        </p>
      </section>

      <section>
        <h2>Broker support</h2>
        <p>
          Automatic sync is supported today for Schwab (including thinkorswim accounts) and Robinhood;
          additional brokers may be added over time. Manual entry works for any broker. Custom broker
          support may be configured upon request at our discretion.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may modify these terms at any time. Material changes will be reflected on this page with an
          updated date.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about these terms? Email{' '}
          <a href="mailto:support@trendchasers.net" className="text-emerald-400 hover:underline">
            support@trendchasers.net
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
