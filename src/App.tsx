import { useRoute } from './hooks/useRoute';
import { AdminPage } from './pages/AdminPage';
import { BrokersPage } from './pages/BrokersPage';
import { CoachViewPage } from './pages/CoachViewPage';
import { LandingPage } from './pages/LandingPage';
import { JournalApp } from './pages/JournalApp';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { ReportBugPage } from './pages/ReportBugPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';

export default function App() {
  const { route, coachToken, navigate } = useRoute();

  const goHome = () => navigate('landing');
  const goApp = () => navigate('app');
  const goBrokers = () => navigate('brokers');
  const goPrivacy = () => navigate('privacy');
  const goTerms = () => navigate('terms');

  const publicPageProps = {
    onHome: goHome,
    onLaunch: goApp,
    onPrivacy: goPrivacy,
    onTerms: goTerms,
    onBrokers: goBrokers,
  };

  if (route === 'coach' && coachToken) {
    return <CoachViewPage token={coachToken} onHome={goHome} />;
  }

  if (route === 'brokers') {
    return <BrokersPage {...publicPageProps} />;
  }

  if (route === 'privacy') {
    return <PrivacyPolicyPage {...publicPageProps} />;
  }

  if (route === 'terms') {
    return <TermsOfServicePage {...publicPageProps} />;
  }

  if (route === 'report-bug') {
    return <ReportBugPage {...publicPageProps} />;
  }

  if (route === 'admin') {
    return <AdminPage {...publicPageProps} />;
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
