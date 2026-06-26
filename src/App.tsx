import { useRoute } from './hooks/useRoute';
import { BrokersPage } from './pages/BrokersPage';
import { LandingPage } from './pages/LandingPage';
import { JournalApp } from './pages/JournalApp';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';

export default function App() {
  const { route, navigate } = useRoute();

  const goHome = () => navigate('landing');
  const goApp = () => navigate('app');
  const goBrokers = () => navigate('brokers');
  const goPrivacy = () => navigate('privacy');
  const goTerms = () => navigate('terms');

  if (route === 'brokers') {
    return (
      <BrokersPage
        onHome={goHome}
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
      />
    );
  }

  if (route === 'privacy') {
    return (
      <PrivacyPolicyPage
        onHome={goHome}
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onBrokers={goBrokers}
      />
    );
  }

  if (route === 'terms') {
    return (
      <TermsOfServicePage
        onHome={goHome}
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onBrokers={goBrokers}
      />
    );
  }

  if (route === 'app') {
    return <JournalApp onHome={goHome} />;
  }

  return (
    <LandingPage
      onLaunch={goApp}
      onPrivacy={goPrivacy}
      onTerms={goTerms}
      onBrokers={goBrokers}
    />
  );
}
