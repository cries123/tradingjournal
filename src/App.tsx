import { useRoute } from './hooks/useRoute';
import { usePageMeta } from './hooks/usePageMeta';
import { useStructuredData } from './hooks/useStructuredData';
import { getPageSeo } from './seo/pageMeta';
import { PageTransition } from './components/motion/FadeIn';
import { AdminPage } from './pages/AdminPage';
import { BrokersPage } from './pages/BrokersPage';
import { CoachViewPage } from './pages/CoachViewPage';
import { GuidePage } from './pages/GuidePage';
import { GuidesIndexPage } from './pages/GuidesIndexPage';
import { LandingPage } from './pages/LandingPage';
import { JournalApp } from './pages/JournalApp';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { ReportBugPage } from './pages/ReportBugPage';
import { RequestBrokerPage } from './pages/RequestBrokerPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';

export default function App() {
  const { route, coachToken, guideSlug, navigate, navigateGuide } = useRoute();
  usePageMeta(getPageSeo(route, coachToken, guideSlug));
  useStructuredData(route, guideSlug);

  const goHome = () => navigate('landing');
  const goApp = () => navigate('app');
  const goBrokers = () => navigate('brokers');
  const goPrivacy = () => navigate('privacy');
  const goTerms = () => navigate('terms');
  const goRequestBroker = () => navigate('request-broker');
  const goAdmin = () => navigate('admin');
  const goGuides = () => navigate('guides');

  const publicPageProps = {
    onHome: goHome,
    onLaunch: goApp,
    onPrivacy: goPrivacy,
    onTerms: goTerms,
    onBrokers: goBrokers,
    onRequestBroker: goRequestBroker,
    onGuides: goGuides,
    onGuide: navigateGuide,
  };

  let content;
  let routeKey: string = route;

  if (route === 'coach' && coachToken) {
    routeKey = `coach-${coachToken}`;
    content = <CoachViewPage token={coachToken} onHome={goHome} />;
  } else if (route === 'guides') {
    content = <GuidesIndexPage {...publicPageProps} />;
  } else if (route === 'guide' && guideSlug) {
    routeKey = `guide-${guideSlug}`;
    content = <GuidePage slug={guideSlug} {...publicPageProps} />;
  } else if (route === 'brokers') {
    content = <BrokersPage {...publicPageProps} />;
  } else if (route === 'privacy') {
    content = <PrivacyPolicyPage {...publicPageProps} />;
  } else if (route === 'terms') {
    content = <TermsOfServicePage {...publicPageProps} />;
  } else if (route === 'report-bug') {
    content = <ReportBugPage {...publicPageProps} />;
  } else if (route === 'request-broker') {
    content = <RequestBrokerPage {...publicPageProps} />;
  } else if (route === 'admin') {
    content = <AdminPage {...publicPageProps} />;
  } else if (route === 'app') {
    content = (
      <div className="h-full min-h-0 flex flex-col">
        <JournalApp onHome={goHome} onAdmin={goAdmin} />
      </div>
    );
  } else {
    content = (
      <LandingPage
        onLaunch={goApp}
        onHome={goHome}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onBrokers={goBrokers}
        onGuides={goGuides}
        onGuide={navigateGuide}
      />
    );
  }

  return <PageTransition routeKey={routeKey}>{content}</PageTransition>;
}
