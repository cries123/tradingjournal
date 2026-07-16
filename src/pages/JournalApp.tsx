import { useMemo, useState } from 'react';
import { AuthModal } from '../components/AuthModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DashboardView } from '../components/DashboardView';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { DayDetailDrawer } from '../components/DayDetailDrawer';
import { MobileBottomNav, MobileDrawer, MobileHeader } from '../components/MobileNav';
import { hasCompletedOnboarding, OnboardingOverlay } from '../components/OnboardingOverlay';
import { SettingsPage } from '../components/SettingsPage';
import { ShareCardModal } from '../components/ShareCardModal';
import { Sidebar, type SidebarAppView } from '../components/Sidebar';
import { BrokersContent } from '../components/support/BrokersContent';
import { ReportBugContent } from '../components/support/ReportBugContent';
import { RequestBrokerContent } from '../components/support/RequestBrokerContent';
import { CsvImportModal } from '../components/CsvImportModal';
import { ScreenshotImportModal } from '../components/ScreenshotImportModal';
import { TradeModal } from '../components/TradeModal';
import { UsernameSetupModal } from '../components/UsernameSetupModal';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useJournalReminder } from '../hooks/useJournalReminder';
import { useTrades } from '../hooks/useTrades';
import type { Trade } from '../types';
import { computeStats, getMonthTrades } from '../utils/stats';

interface JournalAppProps {
  onHome?: () => void;
  onAdmin?: () => void;
}

type AppView = SidebarAppView;

export function JournalApp({ onHome, onAdmin }: JournalAppProps) {
  const isDesktop = useIsDesktop();
  const { user, loading, firebaseEnabled, needsUsername, profileLoading } = useAuth();
  const { settings } = useSettings();
  const {
    trades,
    allTrades,
    everyTrade,
    filters,
    setFilters,
    symbols,
    setups,
    addTrade,
    addTrades,
    updateTrade,
    deleteTrade,
    restoreTrades,
    clearAll,
    syncStatus,
    sampleActive,
    loadSampleData,
    clearSampleData,
  } = useTrades();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [appView, setAppView] = useState<AppView>('dashboard');
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [tradeModalDate, setTradeModalDate] = useState<string | undefined>();
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [importTargetDate, setImportTargetDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clearConfirmStage, setClearConfirmStage] = useState<0 | 1 | 2>(0);
  const [showShareCard, setShowShareCard] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding());

  const showAuthModal = firebaseEnabled && !loading && !user;
  const showUsernameModal = firebaseEnabled && !loading && !profileLoading && needsUsername;
  const isLoading = syncStatus === 'loading';

  const activeJournalName =
    settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'this journal';

  const monthTrades = useMemo(() => getMonthTrades(allTrades, year, month), [allTrades, year, month]);
  const monthStats = useMemo(() => computeStats(monthTrades), [monthTrades]);

  useJournalReminder(settings.remindersEnabled, settings.reminderTime, allTrades);

  const filterSetups = useMemo(
    () => [...new Set([...settings.setupTags, ...setups])].sort(),
    [settings.setupTags, setups],
  );

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
    setEditingTrade(null);
    setTradeModalDate(date);
    setShowTradeModal(true);
  };

  const openEditTrade = (trade: Trade) => {
    setEditingTrade(trade);
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

  const closeTradeModal = () => {
    setShowTradeModal(false);
    setTradeModalDate(undefined);
    setEditingTrade(null);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const sidebarActions = {
    appView,
    onDashboard: () => {
      setAppView('dashboard');
      closeMobileMenu();
    },
    onAddTrade: () => openAddTrade(),
    onImportScreenshot: () => openImportScreenshot(),
    onImportCsv: () => openImportCsv(),
    onClearAll: () => setClearConfirmStage(1),
    onSettings: () => {
      setAppView('settings');
      closeMobileMenu();
    },
    onBrokers: () => {
      setAppView('brokers');
      closeMobileMenu();
    },
    onReportBug: () => {
      setAppView('report-bug');
      closeMobileMenu();
    },
    onRequestBroker: () => {
      setAppView('request-broker');
      closeMobileMenu();
    },
    onShareCard: () => {
      setAppView('dashboard');
      setShowShareCard(true);
      closeMobileMenu();
    },
    shareCardEnabled: monthStats.totalTrades > 0,
    onAdmin,
  };

  return (
    <div
      className={`flex w-full bg-bg-primary dashboard-bg ${
        isDesktop ? 'min-h-dvh' : 'h-full min-h-0 flex-1 flex flex-col overflow-hidden'
      }`}
    >
      {isDesktop && <Sidebar variant="desktop" onHome={onHome} {...sidebarActions} />}

      <div className={`flex-1 flex flex-col min-w-0 w-full ${isDesktop ? '' : 'min-h-0'}`}>
        {!isDesktop && <MobileHeader onOpenMenu={() => setMobileMenuOpen(true)} onHome={onHome} />}

        <main
          className={`flex-1 p-2 md:p-5 ${
            isDesktop
              ? 'overflow-visible'
              : 'min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]'
          }`}
        >
          <div className="max-w-6xl mx-auto w-full pb-6 md:pb-10">
            {appView === 'settings' ? (
              <SettingsPage
                trades={allTrades}
                everyTrade={everyTrade}
                monthStats={monthStats}
                year={year}
                month={month}
                onBack={() => setAppView('dashboard')}
                onRestoreTrades={restoreTrades}
              />
            ) : appView === 'brokers' ? (
              <BrokersContent
                onBack={() => setAppView('dashboard')}
                onRequestBroker={() => setAppView('request-broker')}
              />
            ) : appView === 'report-bug' ? (
              <ReportBugContent onBack={() => setAppView('dashboard')} />
            ) : appView === 'request-broker' ? (
              <RequestBrokerContent onBack={() => setAppView('dashboard')} />
            ) : isLoading ? (
              <DashboardSkeleton />
            ) : (
              <DashboardView
                trades={trades}
                hasAnyTrades={allTrades.length > 0}
                year={year}
                month={month}
                filters={filters}
                filterSymbols={symbols}
                filterSetups={filterSetups}
                onFiltersChange={setFilters}
                onDayClick={setSelectedDay}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onMonthChange={handleMonthChange}
                onPrevYear={() => setYear((y) => y - 1)}
                onNextYear={() => setYear((y) => y + 1)}
                onSelectMonth={setMonth}
                onAddTrade={() => openAddTrade()}
                onImportCsv={() => openImportCsv()}
                onImportScreenshot={() => openImportScreenshot()}
                sampleActive={sampleActive}
                onLoadSample={loadSampleData}
                onClearSample={clearSampleData}
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

      {showShareCard && (
        <ShareCardModal
          period="month"
          stats={monthStats}
          year={year}
          month={month}
          onClose={() => setShowShareCard(false)}
        />
      )}

      {showOnboarding && !showAuthModal && !showUsernameModal && appView === 'dashboard' && (
        <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
      )}

      {showAuthModal && <AuthModal />}

      {showUsernameModal && <UsernameSetupModal />}

      {clearConfirmStage === 1 && (
        <ConfirmDialog
          title={`Clear "${activeJournalName}"?`}
          message={`This deletes all ${allTrades.length} trade${allTrades.length === 1 ? '' : 's'} in "${activeJournalName}" only. Your other journals are not touched.`}
          confirmLabel="Continue"
          danger
          onConfirm={() => setClearConfirmStage(2)}
          onCancel={() => setClearConfirmStage(0)}
        />
      )}

      {clearConfirmStage === 2 && (
        <ConfirmDialog
          title="Are you absolutely sure?"
          message={`Last check: every trade in "${activeJournalName}" will be permanently deleted. This cannot be undone. Consider downloading a backup from Settings first.`}
          confirmLabel="Yes, wipe this journal"
          cancelLabel="Keep my trades"
          danger
          onConfirm={() => {
            void clearAll();
            setClearConfirmStage(0);
          }}
          onCancel={() => setClearConfirmStage(0)}
        />
      )}

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
          trade={editingTrade ?? undefined}
          defaultDate={tradeModalDate}
          onClose={closeTradeModal}
          onSave={addTrade}
          onUpdate={updateTrade}
        />
      )}

      {selectedDay && (
        <DayDetailDrawer
          date={selectedDay}
          trades={allTrades}
          onClose={() => setSelectedDay(null)}
          onDelete={deleteTrade}
          onEdit={openEditTrade}
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
