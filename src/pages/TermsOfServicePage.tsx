import { LegalPageLayout } from './LegalPageLayout';

interface TermsOfServicePageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}

export function TermsOfServicePage({ onHome, onLaunch, onPrivacy, onTerms }: TermsOfServicePageProps) {
  return (
    <LegalPageLayout title="Terms of Service" onHome={onHome} onLaunch={onLaunch} onPrivacy={onPrivacy} onTerms={onTerms}>
      <section>
        <h2>Agreement</h2>
        <p>
          By using Trading Journal, you agree to these Terms of Service. If you do not agree, please do not
          use the app.
        </p>
      </section>

      <section>
        <h2>What this product is</h2>
        <p>
          Trading Journal is a personal record-keeping tool for tracking trades and performance. It is not
          a broker, investment advisor, or financial institution. Nothing in the app constitutes financial,
          tax, or legal advice.
        </p>
      </section>

      <section>
        <h2>No brokerage connection</h2>
        <p>
          You are solely responsible for importing accurate trade data. We do not connect to your broker,
          execute trades, or verify the accuracy of imported information. All imports are initiated by you.
        </p>
      </section>

      <section>
        <h2>AI screenshot parsing</h2>
        <p>
          AI import is provided as a convenience and may contain errors. Always review parsed trades before
          saving. We are not liable for mistakes in AI-extracted data, including incorrect P/L signs or symbols.
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
          Trading Journal is provided &quot;as is&quot; without warranties. To the fullest extent permitted by law,
          we are not liable for trading losses, data loss, or damages arising from use of the app. You trade
          at your own risk.
        </p>
      </section>

      <section>
        <h2>Broker support</h2>
        <p>
          Import formats for Thinkorswim, Schwab, and Robinhood are supported today; additional brokers may
          be added over time. Custom broker support may be configured upon request at our discretion.
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
          Questions about these terms? Contact us via the links in the footer.
        </p>
      </section>
    </LegalPageLayout>
  );
}
