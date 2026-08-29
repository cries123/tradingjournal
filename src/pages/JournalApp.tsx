import { useMemo, useState } from 'react';
import { AuthModal } from '../components/AuthModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DashboardView } from '../components/DashboardView';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { DayDetailDrawer } from '../components/DayDetailDrawer';
import { LeaderboardContent } from '../components/LeaderboardContent';
import { MobileBottomNav, MobileDrawer, MobileHeader } from '../components/MobileNav';
import { hasCompletedOnboarding, OnboardingOverlay } from '../components/OnboardingOverlay';
import { SettingsPage } from '../components/SettingsPage';
import { ShareCardModal } from '../components/ShareCardModal';
import { Sidebar, type SidebarAppView } from '../components/Sidebar';
import { Starfield } from '../components/Starfield';
import { BrokerConnectContent } from '../components/brokers/BrokerConnectContent';
import { BrokersContent } from '../components/support/BrokersContent';
import { ReportBugContent } from '../components/support/ReportBugContent';
import { RequestBrokerContent } from '../components/support/RequestBrokerContent';
import { TradeModal } from '../components/TradeModal';
import { UsernameSetupModal } from '../components/UsernameSetupModal';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useJournalReminder } from '../hooks/useJournalReminder';
import { useLeaderboardSync } from '../hooks/useLeaderboardSync';
import { useTrades } from '../hooks/useTrades';
import type { Trade } from '../types';
import { computeStats, getMonthTrades } from '../utils/stats';
import { takePendingAppView } from '../utils/pendingAppView';
import { useDuplicateCleanup } from '../hooks/useDuplicateCleanup';
import { AssistantDock } from '../components/analytics/AssistantDock';
import { formatMonthYear } from '../utils/format';

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
    removeTrades,
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
  // Open straight to the broker screen when the URL asks for it, so the landing page's
  // "Connect a broker" button lands where it says it will instead of dropping you on the
  // dashboard to go find it. Also covers SnapTrade's post-connect redirect (?brokerConnected=1).
  const [appView, setAppView] = useState<AppView>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    // Either the landing page asked for the broker screen, or SnapTrade just redirected the
    // user back here after they approved a connection.
    if (takePendingAppView() === 'connect-broker') return 'connect-broker';
    return new URLSearchParams(window.location.search).has('brokerConnected')
      ? 'connect-broker'
      : 'dashboard';
  });
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeModalDate, setTradeModalDate] = useState<string | undefined>();
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clearConfirmStage, setClearConfirmStage] = useState<0 | 1 | 2>(0);
  const [clearError, setClearError] = useState<string | null>(null);
  const [showShareCard, setShowShareCard] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding());
  const [assistantOpen, setAssistantOpen] = useState(false);

  const showAuthModal = firebaseEnabled && !loading && !user;
  const showUsernameModal = firebaseEnabled && !loading && !profileLoading && needsUsername;
  const isLoading = syncStatus === 'loading';

  const activeJournalName =
    settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'this journal';

  const monthTrades = useMemo(() => getMonthTrades(allTrades, year, month), [allTrades, year, month]);
  const monthStats = useMemo(() => computeStats(monthTrades), [monthTrades]);

  useJournalReminder(settings.remindersEnabled, settings.reminderTime, allTrades);
  // Every journal's trades, not just the active one — a trader's leaderboard standing is about
  // them, not whichever journal happens to be selected right now.
  useLeaderboardSync(everyTrade);
  // Broker syncing is manual: it happens on the Connect Broker screen when the trader presses the
  // button, and nowhere else. An automatic version shipped briefly and had to be pulled — it could
  // fire before the journal finished loading, dedupe against an empty list, and re-import someone's
  // entire history. Anything automatic here needs a much stronger guarantee than that one had.
  //
  // This clears up the rows that bug already wrote. Gated on the journal being loaded, and it only
  // ever removes a row while a surviving copy of the same broker trade is visible beside it.
  const duplicateCleanup = useDuplicateCleanup(
    everyTrade,
    removeTrades,
    syncStatus !== 'loading' && syncStatus !== 'syncing',
  );
  const hasBrokerTrades = useMemo(() => everyTrade.some((t) => Boolean(t.sourceId)), [everyTrade]);

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
    onConnectBroker: () => {
      setAppView('connect-broker');
      closeMobileMenu();
    },
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
    onLeaderboard: () => {
      setAppView('leaderboard');
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
      <Starfield />
      {isDesktop && <Sidebar variant="desktop" onHome={onHome} {...sidebarActions} />}

      {/* relative: keeps this content painting above the fixed Starfield canvas behind it */}
      <div className={`relative flex-1 flex flex-col min-w-0 w-full ${isDesktop ? '' : 'min-h-0'}`}>
        {!isDesktop && <MobileHeader onHome={onHome} />}

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
            ) : appView === 'connect-broker' ? (
              <BrokerConnectContent
                onBack={() => setAppView('dashboard')}
                onImportTrades={addTrades}
                /* everyTrade, not `trades`: `trades` is the FILTERED view, so syncing with a
                   symbol or tag filter active would dedupe against a subset and re-import
                   everything hidden by the filter. It also has to span every journal, since a
                   trade already imported into another one is still already imported. */
                existingTrades={everyTrade}
              />
            ) : appView === 'report-bug' ? (
              <ReportBugContent onBack={() => setAppView('dashboard')} />
            ) : appView === 'request-broker' ? (
              <RequestBrokerContent onBack={() => setAppView('dashboard')} />
            ) : appView === 'leaderboard' ? (
              <LeaderboardContent onBack={() => setAppView('dashboard')} />
            ) : isLoading ? (
              <DashboardSkeleton />
            ) : (
              <DashboardView
                duplicatesRemoved={duplicateCleanup.removed}
                onDismissDuplicateNotice={duplicateCleanup.acknowledge}
                onSyncBroker={() => setAppView('connect-broker')}
                hasBrokerTrades={hasBrokerTrades}
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
                onConnectBroker={() => setAppView('connect-broker')}
                sampleActive={sampleActive}
                onLoadSample={loadSampleData}
                onClearSample={clearSampleData}
              />
            )}
          </div>
        </main>

        {!isDesktop && (
          <MobileBottomNav
            appView={appView}
            onOpenMenu={() => setMobileMenuOpen(true)}
            onAddTrade={() => openAddTrade()}
            onDashboard={() => setAppView('dashboard')}
            onLeaderboard={() => setAppView('leaderboard')}
            onAssistant={() => setAssistantOpen((v) => !v)}
            assistantOpen={assistantOpen}
          />
        )}
      </div>

      <AssistantDock
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        trades={monthTrades}
        periodLabel={formatMonthYear(year, month)}
        showLauncher={isDesktop}
      />

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
            setClearConfirmStage(0);
            setClearError(null);
            void clearAll().catch((err) => {
              console.error('[clear-journal] failed:', err);
              setClearError(
                "Couldn't clear the journal — some trades may still be there. Check your connection and try again.",
              );
            });
          }}
          onCancel={() => setClearConfirmStage(0)}
        />
      )}

      {clearError && (
        <ConfirmDialog
          title="Clearing didn't finish"
          message={clearError}
          confirmLabel="OK"
          onConfirm={() => setClearError(null)}
          onCancel={() => setClearError(null)}
        />
      )}

      {showTradeModal && (
        <TradeModal
          key={editingTrade?.id ?? 'new'}
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
        />
      )}
    </div>
  );
}
