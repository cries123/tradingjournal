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
    <LegalPageLayout title="Privacy Policy" onHome={onHome} onLaunch={onLaunch} onPrivacy={onPrivacy} onTerms={onTerms} onBrokers={onBrokers}>
      <section>
        <h2>Overview</h2>
        <p>
          Trend Chasers (&quot;we,&quot; &quot;us,&quot; or &quot;the app&quot;) respects your privacy. This policy explains
          what information we collect, how we use it, and your choices. We built this product so you can
          track trades without connecting your brokerage account.
        </p>
      </section>

      <section>
        <h2>We never ask for brokerage login</h2>
        <p>
          Trend Chasers does not integrate with, authenticate to, or request credentials for any broker
          (including Thinkorswim, Schwab, Robinhood, or others). You import data yourself — via CSV upload,
          screenshot, or manual entry. We have no access to your brokerage account.
        </p>
      </section>

      <section>
        <h2>Information you provide</h2>
        <ul>
          <li><strong>Trade data</strong> — symbols, P/L, dates, notes, and other fields you enter or import.</li>
          <li><strong>Account information</strong> — if you create an account, we store your email via Firebase Authentication.</li>
          <li><strong>Screenshots</strong> — if you use AI screenshot import, images are sent to our server and OpenAI for parsing only when you initiate that feature.</li>
          <li><strong>CSV files</strong> — processed in your browser; your statement file is not uploaded to our servers unless you explicitly use a feature that requires it.</li>
        </ul>
      </section>

      <section>
        <h2>How we store data</h2>
        <p>
          Without an account, trades are stored locally in your browser. With an account, trades sync to
          Google Firebase Firestore under your user ID. You can sign out and continue using local storage only.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <ul>
          <li><strong>Firebase</strong> — authentication and cloud storage (Google).</li>
          <li><strong>OpenAI</strong> — optional screenshot parsing when you use AI import.</li>
          <li><strong>Netlify</strong> — hosting and serverless functions for the app and AI API.</li>
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
          Firebase/Google account settings. For questions or deletion requests, contact us via the links
          in the footer.
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
          Questions about privacy? Reach out via GitHub Issues or Report a bug in the site footer.
        </p>
      </section>
    </LegalPageLayout>
  );
}
