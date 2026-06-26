import { useRoute } from './hooks/useRoute';
import { LandingPage } from './pages/LandingPage';
import { JournalApp } from './pages/JournalApp';

export default function App() {
  const { route, navigate } = useRoute();

  if (route === 'landing') {
    return <LandingPage onLaunch={() => navigate('app')} />;
  }

  return <JournalApp onHome={() => navigate('landing')} />;
}
