import { useRoute } from './hooks/useRoute';
import { LandingPage } from './pages/LandingPage';
import { JournalApp } from './pages/JournalApp';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';

export default function App() {
  const { route, navigate } = useRoute();

  const goHome = () => navigate('landing');
  const goApp = () => navigate('app');
  const goPrivacy = () => navigate('privacy');
  const goTerms = () => navigate('terms');

  if (route === 'privacy') {
    return (
      <PrivacyPolicyPage
        onHome={goHome}
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
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
      />
    );
  }

  if (route === 'app') {
    return <JournalApp onHome={goHome} />;
  }

  return <LandingPage onLaunch={goApp} onPrivacy={goPrivacy} onTerms={goTerms} />;
}
