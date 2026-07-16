import { Suspense, lazy } from 'react';
import { useRoute } from './hooks/useRoute';
import { usePageMeta } from './hooks/usePageMeta';
import { useStructuredData } from './hooks/useStructuredData';
import { useVisitorTracking } from './hooks/useVisitorTracking';
import { getPageSeo } from './seo/pageMeta';
import { PageTransition } from './components/motion/FadeIn';
import { LandingPage } from './pages/LandingPage';

const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const BrokerGuidePage = lazy(() => import('./pages/BrokerGuidePage').then((m) => ({ default: m.BrokerGuidePage })));
const BrokersPage = lazy(() => import('./pages/BrokersPage').then((m) => ({ default: m.BrokersPage })));
const CoachViewPage = lazy(() => import('./pages/CoachViewPage').then((m) => ({ default: m.CoachViewPage })));
const GuidePage = lazy(() => import('./pages/GuidePage').then((m) => ({ default: m.GuidePage })));
const GuidesIndexPage = lazy(() => import('./pages/GuidesIndexPage').then((m) => ({ default: m.GuidesIndexPage })));
const JournalApp = lazy(() => import('./pages/JournalApp').then((m) => ({ default: m.JournalApp })));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })));
const ReportBugPage = lazy(() => import('./pages/ReportBugPage').then((m) => ({ default: m.ReportBugPage })));
const RequestBrokerPage = lazy(() => import('./pages/RequestBrokerPage').then((m) => ({ default: m.RequestBrokerPage })));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage').then((m) => ({ default: m.TermsOfServicePage })));

function RouteLoading() {
  return (
    <div
      data-route-loading
      className="min-h-dvh flex items-center justify-center bg-bg-primary"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="w-8 h-8 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
    </div>
  );
}

export default function App() {
  const { route, coachToken, guideSlug, brokerSlug, navigate, navigateGuide } = useRoute();
  usePageMeta(getPageSeo(route, coachToken, guideSlug, brokerSlug));
  useStructuredData(route, guideSlug, brokerSlug);
  useVisitorTracking(route, guideSlug, brokerSlug);

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
  } else if (route === 'broker-guide' && brokerSlug) {
    routeKey = `broker-guide-${brokerSlug}`;
    content = <BrokerGuidePage slug={brokerSlug} {...publicPageProps} />;
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

  return (
    <Suspense fallback={<RouteLoading />}>
      <PageTransition routeKey={routeKey}>{content}</PageTransition>
    </Suspense>
  );
}
