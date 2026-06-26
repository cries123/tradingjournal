import { useRoute } from './hooks/useRoute';
import { PageTransition } from './components/motion/FadeIn';
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

  let content;

  if (route === 'brokers') {
    content = (
      <BrokersPage
        onHome={goHome}
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
      />
    );
  } else if (route === 'privacy') {
    content = (
      <PrivacyPolicyPage
        onHome={goHome}
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onBrokers={goBrokers}
      />
    );
  } else if (route === 'terms') {
    content = (
      <TermsOfServicePage
        onHome={goHome}
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onBrokers={goBrokers}
      />
    );
  } else if (route === 'app') {
    content = <JournalApp onHome={goHome} />;
  } else {
    content = (
      <LandingPage
        onLaunch={goApp}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onBrokers={goBrokers}
      />
    );
  }

  return <PageTransition routeKey={route}>{content}</PageTransition>;
}
