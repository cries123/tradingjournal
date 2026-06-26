import { useMemo, useState } from 'react';
import { AuthModal } from '../components/AuthModal';
import { DashboardView } from '../components/DashboardView';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { DayDetailDrawer } from '../components/DayDetailDrawer';
import { MobileBottomNav, MobileDrawer, MobileHeader } from '../components/MobileNav';
import { SettingsPage } from '../components/SettingsPage';
import { Sidebar } from '../components/Sidebar';
import { CsvImportModal } from '../components/CsvImportModal';
import { ScreenshotImportModal } from '../components/ScreenshotImportModal';
import { TradeModal } from '../components/TradeModal';
import { useAuth } from '../context/AuthContext';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useTrades } from '../hooks/useTrades';
import { computeStats, getMonthTrades } from '../utils/stats';

interface JournalAppProps {
  onHome?: () => void;
}

type AppView = 'dashboard' | 'settings';

export function JournalApp({ onHome }: JournalAppProps) {
  const isDesktop = useIsDesktop();
  const { user, loading, firebaseEnabled } = useAuth();
  const {
    trades,
    allTrades,
    addTrade,
    addTrades,
    deleteTrade,
    clearAll,
    syncStatus,
  } = useTrades();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [appView, setAppView] = useState<AppView>('dashboard');
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [tradeModalDate, setTradeModalDate] = useState<string | undefined>();
  const [importTargetDate, setImportTargetDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const showAuthModal = firebaseEnabled && !loading && !user;
  const isLoading = syncStatus === 'loading';

  const monthTrades = useMemo(() => getMonthTrades(allTrades, year, month), [allTrades, year, month]);
  const monthStats = useMemo(() => computeStats(monthTrades), [monthTrades]);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleMonthChange = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };

  const openAddTrade = (date?: string) => {
    setTradeModalDate(date);
    setShowTradeModal(true);
  };

  const openImportCsv = (date?: string) => {
    setImportTargetDate(date);
    setShowCsvModal(true);
    if (date) setSelectedDay(null);
  };

  const openImportScreenshot = (date?: string) => {
    setImportTargetDate(date);
    setShowImportModal(true);
    if (date) setSelectedDay(null);
  };

  const closeImportModals = () => {
    setShowCsvModal(false);
    setShowImportModal(false);
    setImportTargetDate(undefined);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const sidebarActions = {
    onAddTrade: () => openAddTrade(),
    onImportScreenshot: () => openImportScreenshot(),
    onImportCsv: () => openImportCsv(),
    onClearAll: () => void clearAll(),
    onSettings: () => {
      setAppView('settings');
      closeMobileMenu();
    },
  };

  return (
    <div className="flex h-full bg-bg-primary overflow-hidden dashboard-bg">
      {isDesktop && <Sidebar variant="desktop" onHome={onHome} {...sidebarActions} />}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full">
        {!isDesktop && <MobileHeader onOpenMenu={() => setMobileMenuOpen(true)} onHome={onHome} />}

        <main
          className={`flex-1 min-h-0 p-2 md:p-5 ${
            isDesktop ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          <div className={`h-full ${isDesktop ? 'max-w-6xl mx-auto w-full' : ''}`}>
            {appView === 'settings' ? (
              <SettingsPage
                trades={allTrades}
                monthStats={monthStats}
                year={year}
                month={month}
                onBack={() => setAppView('dashboard')}
              />
            ) : isLoading ? (
              <DashboardSkeleton />
            ) : (
              <DashboardView
                trades={trades}
                year={year}
                month={month}
                onDayClick={setSelectedDay}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onMonthChange={handleMonthChange}
              />
            )}
          </div>
        </main>

        {!isDesktop && appView === 'dashboard' && (
          <MobileBottomNav
            onOpenMenu={() => setMobileMenuOpen(true)}
            onAddTrade={() => openAddTrade()}
            onImportScreenshot={() => openImportScreenshot()}
          />
        )}
      </div>

      {!isDesktop && (
        <MobileDrawer open={mobileMenuOpen} onClose={closeMobileMenu}>
          <Sidebar variant="drawer" onHome={onHome} {...sidebarActions} onNavigate={closeMobileMenu} />
        </MobileDrawer>
      )}

      {showAuthModal && <AuthModal />}

      {showCsvModal && (
        <CsvImportModal
          targetDate={importTargetDate}
          onClose={closeImportModals}
          onSave={(t) => {
            addTrades(t);
            closeImportModals();
          }}
        />
      )}

      {showImportModal && (
        <ScreenshotImportModal
          targetDate={importTargetDate}
          onClose={closeImportModals}
          onSave={(t) => {
            addTrades(t);
            closeImportModals();
          }}
        />
      )}

      {showTradeModal && (
        <TradeModal
          defaultDate={tradeModalDate}
          onClose={() => {
            setShowTradeModal(false);
            setTradeModalDate(undefined);
          }}
          onSave={addTrade}
        />
      )}

      {selectedDay && (
        <DayDetailDrawer
          date={selectedDay}
          trades={allTrades}
          onClose={() => setSelectedDay(null)}
          onDelete={deleteTrade}
          onAddTrade={() => {
            openAddTrade(selectedDay);
            setSelectedDay(null);
          }}
          onImportCsv={() => openImportCsv(selectedDay)}
          onImportScreenshot={() => openImportScreenshot(selectedDay)}
        />
      )}
    </div>
  );
}
