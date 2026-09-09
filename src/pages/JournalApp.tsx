import { useMemo, useState } from 'react';
import { AuthModal } from '../components/AuthModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DashboardView } from '../components/DashboardView';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { DayDetailDrawer } from '../components/DayDetailDrawer';
import { LeaderboardContent } from '../components/LeaderboardContent';
import { MobileBottomNav, MobileDrawer, MobileHeader } from '../components/MobileNav';
import { OnboardingOverlay } from '../components/OnboardingOverlay';
import { hasCompletedOnboarding, hideGettingStarted, isGettingStartedHidden } from '../utils/onboarding';
import { GettingStartedCard } from '../components/onboarding/GettingStartedCard';
import { useEntitlement } from '../context/useEntitlement';
import type { OnboardingStepId } from '../utils/onboardingSteps';
import { SettingsPage } from '../components/SettingsPage';
import { Sidebar, type SidebarAppView } from '../components/Sidebar';
import { Starfield } from '../components/Starfield';
import { BrokerConnectContent } from '../components/brokers/BrokerConnectContent';
import { LockedFeature } from '../components/plan/LockedFeature';
import { BrokersContent } from '../components/support/BrokersContent';
import { ReportBugContent } from '../components/support/ReportBugContent';
import { SupportDashboard } from '../components/support/SupportDashboard';
import { AssistantContent } from '../components/analytics/AssistantContent';
import { PerformanceContent } from '../components/PerformanceContent';
import { RequestBrokerContent } from '../components/support/RequestBrokerContent';
import { TradeModal } from '../components/TradeModal';
import { UsernameSetupModal } from '../components/UsernameSetupModal';
import { useAuth } from '../context/useAuth';
import { useSettings } from '../context/useSettings';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useJournalReminder } from '../hooks/useJournalReminder';
import { useLeaderboardSync } from '../hooks/useLeaderboardSync';
import { useTrades } from '../hooks/useTrades';
import type { Trade } from '../types';
import { computeStats, getMonthTrades, getYearTrades } from '../utils/stats';
import { takePendingAppView } from '../utils/pendingAppView';
import { AssistantDock } from '../components/analytics/AssistantDock';
import { formatMonthYear } from '../utils/format';
import { currentView, popView, pushView } from '../utils/viewStack';
import { JournalOfflineBanner } from '../components/JournalOfflineBanner';

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
    syncError,
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
  const [viewStack, setViewStack] = useState<AppView[]>(() => {
    if (typeof window === 'undefined') return ['dashboard'];
    // Either the landing page asked for the broker screen, or SnapTrade just redirected the
    // user back here after they approved a connection. Either way the dashboard stays underneath,
    // so back from the broker screen has somewhere to go.
    const wantsBroker =
      takePendingAppView() === 'connect-broker'
      || new URLSearchParams(window.location.search).has('brokerConnected');
    return wantsBroker ? ['dashboard', 'connect-broker'] : ['dashboard'];
  });

  const appView = currentView(viewStack, 'dashboard');
  /** Drill into a screen, remembering the one being left. */
  const openView = (next: AppView) => setViewStack((stack) => pushView(stack, next));
  /** Back: the screen before this one, whatever it was. */
  const goBackView = () => setViewStack((stack) => popView(stack, 'dashboard'));
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeModalDate, setTradeModalDate] = useState<string | undefined>();
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clearConfirmStage, setClearConfirmStage] = useState<0 | 1 | 2>(0);
  const [clearError, setClearError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding());
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [gettingStartedHidden, setGettingStartedHidden] = useState(() => isGettingStartedHidden());

  const showAuthModal = firebaseEnabled && !loading && !user;
  const showUsernameModal = firebaseEnabled && !loading && !profileLoading && needsUsername;
  const isLoading = syncStatus === 'loading';


  const activeJournalName =
    settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'this journal';

  const monthTrades = useMemo(() => getMonthTrades(allTrades, year, month), [allTrades, year, month]);
  const monthStats = useMemo(() => computeStats(monthTrades), [monthTrades]);

  // The assistant can review any of these without the trader having to change what the dashboard
  // is showing — asking "how was my year?" shouldn't mean navigating away from the month first.
  const assistantPeriods = useMemo(
    () => [
      { scope: 'month' as const, label: formatMonthYear(year, month), trades: monthTrades },
      { scope: 'year' as const, label: String(year), trades: getYearTrades(allTrades, year) },
      { scope: 'all' as const, label: 'All time', trades: allTrades },
    ],
    [allTrades, monthTrades, year, month],
  );

  useJournalReminder(settings.remindersEnabled, settings.reminderTime, allTrades);
  // Every journal's trades, not just the active one — a trader's leaderboard standing is about
  // them, not whichever journal happens to be selected right now.
  useLeaderboardSync(everyTrade);
  // Broker syncing is manual: it happens on the Connect Broker screen when the trader presses the
  // button, and nowhere else. An automatic version shipped briefly and had to be pulled — it could
  // fire before the journal finished loading, dedupe against an empty list, and re-import someone's
  // entire history. Anything automatic here needs a much stronger guarantee than that one had.
  const hasBrokerTrades = useMemo(() => everyTrade.some((t) => Boolean(t.sourceId)), [everyTrade]);
  const { has } = useEntitlement();
  /* The reflection habit, observed rather than asked about: a trade carrying a note means they
     came back to it, which is the whole point of keeping a journal. */
  const hasTradeNote = useMemo(() => everyTrade.some((t) => Boolean(t.notes?.trim())), [everyTrade]);
  const latestTradeDate = useMemo(
    () => everyTrade.reduce<string | null>((latest, t) => (!latest || t.date > latest ? t.date : latest), null),
    [everyTrade],
  );

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
      openView('dashboard');
      closeMobileMenu();
    },
    onAddTrade: () => openAddTrade(),
    onConnectBroker: () => {
      openView('connect-broker');
      closeMobileMenu();
    },
    onSettings: () => {
      openView('settings');
      closeMobileMenu();
    },
    onSupport: () => {
      openView('support');
      closeMobileMenu();
    },
    onPerformance: () => {
      openView('performance');
      closeMobileMenu();
    },
    onAssistant: () => {
      openView('assistant');
      closeMobileMenu();
    },
    onLeaderboard: () => {
      openView('leaderboard');
      closeMobileMenu();
    },
    onAdmin,
  };

  return (
    <div
      className={`flex w-full bg-bg-primary dashboard-bg ${
        isDesktop ? 'min-h-dvh' : 'h-full min-h-0 flex-1 flex flex-col overflow-hidden'
      }`}
    >
      <Starfield subtle />
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
          {/* 1680, not 1152. At 1900px the old cap threw away 538px — a third of the space beside
              the sidebar — and forced everything into one tall column. Same cap the Brokers,
              Tutorials and Help Center pages already use, so the app and the site line up. */}
          <div className="max-w-[1680px] mx-auto w-full pb-6 md:pb-10">
            {syncError && <JournalOfflineBanner message={syncError} />}
            {appView === 'settings' ? (
              <SettingsPage
                trades={allTrades}
                everyTrade={everyTrade}
                monthStats={monthStats}
                year={year}
                month={month}
                onBack={goBackView}
                onRestoreTrades={restoreTrades}
                onClearAll={() => setClearConfirmStage(1)}
              />
            ) : appView === 'brokers' ? (
              <BrokersContent
                onBack={goBackView}
                onRequestBroker={() => openView('request-broker')}
              />
            ) : appView === 'connect-broker' ? (
              <LockedFeature
                feature="brokerSync"
                title="Broker sync is a paid feature"
                description="Connect your brokerage and press Sync to import your fills — entries, exits, fees and all, matched into round-trip trades."
              >
                <BrokerConnectContent
                  onBack={goBackView}
                  onImportTrades={addTrades}
                  /* everyTrade, not `trades`: `trades` is the FILTERED view, so syncing with a
                     symbol or tag filter active would dedupe against a subset and re-import
                     everything hidden by the filter. It also has to span every journal, since a
                     trade already imported into another one is still already imported. */
                  existingTrades={everyTrade}
                  journalReady={syncStatus !== 'loading'}
                />
              </LockedFeature>
            ) : appView === 'performance' ? (
              <LockedFeature
                feature="performanceAnalytics"
                title="Performance analysis is a paid feature"
                description="See what time of day you actually make money, which setups pay, your expectancy in R, and whether following your own rules is worth anything."
              >
                <PerformanceContent
                  trades={allTrades}
                  year={year}
                  month={month}
                  onBack={goBackView}
                />
              </LockedFeature>
            ) : appView === 'assistant' ? (
              <LockedFeature
                feature="aiAssistant"
                title="The trading assistant is a paid feature"
                description="Ask your journal why a setup keeps losing, whether you cut winners early, or what changed since last month. It reads the stats your dashboard already computed."
              >
                <AssistantContent
                  periods={assistantPeriods}
                  rules={settings.tradingRules}
                  onBack={goBackView}
                />
              </LockedFeature>
            ) : appView === 'support' ? (
              <SupportDashboard
                onBack={goBackView}
                onBrokers={() => openView('brokers')}
                onRequestBroker={() => openView('request-broker')}
              />
            ) : appView === 'report-bug' ? (
              <ReportBugContent onBack={goBackView} />
            ) : appView === 'request-broker' ? (
              <RequestBrokerContent onBack={goBackView} />
            ) : appView === 'leaderboard' ? (
              <LeaderboardContent onBack={goBackView} />
            ) : isLoading ? (
              <DashboardSkeleton />
            ) : (
              <>
                {/* Above the dashboard, and only while there is something on it left to do. */}
                {!gettingStartedHidden && (
                  <GettingStartedCard
                    tradeCount={everyTrade.length}
                    brokerConnected={hasBrokerTrades}
                    hasTradeNote={hasTradeNote}
                    hasRiskRules={settings.tradingRules.enabled}
                    canConnectBroker={has('brokerSync')}
                    onDismiss={() => {
                      hideGettingStarted();
                      setGettingStartedHidden(true);
                    }}
                    onStep={(step: OnboardingStepId) => {
                      if (step === 'log-trade') setShowTradeModal(true);
                      else if (step === 'connect-broker') openView('connect-broker');
                      else if (step === 'set-rules') openView('settings');
                      // A day note is written from a day, so send them to the most recent one they
                      // have — or to logging a trade, since there is no day to open without one.
                      else if (latestTradeDate) setSelectedDay(latestTradeDate);
                      else setShowTradeModal(true);
                    }}
                  />
                )}
                <DashboardView
                  everyTrade={everyTrade}
                  onRemoveTrades={removeTrades}
                  onSyncBroker={() => openView('connect-broker')}
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
                  onConnectBroker={() => openView('connect-broker')}
                  sampleActive={sampleActive}
                  onLoadSample={loadSampleData}
                  onClearSample={clearSampleData}
                />
              </>
            )}
          </div>
        </main>

        {!isDesktop && (
          <MobileBottomNav
            appView={appView}
            onOpenMenu={() => setMobileMenuOpen(true)}
            onAddTrade={() => openAddTrade()}
            onDashboard={() => openView('dashboard')}
            onLeaderboard={() => openView('leaderboard')}
            onAssistant={() => openView('assistant')}
            assistantOpen={assistantOpen}
          />
        )}
      </div>

      <AssistantDock
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        periods={assistantPeriods}
        rules={settings.tradingRules}
        /* No floating bubble while the Assistant tab is open — it would sit on top of the very
           panel it opens. */
        showLauncher={isDesktop && appView !== 'assistant'}
      />

      {!isDesktop && (
        <MobileDrawer open={mobileMenuOpen} onClose={closeMobileMenu}>
          <Sidebar variant="drawer" onHome={onHome} {...sidebarActions} onNavigate={closeMobileMenu} />
        </MobileDrawer>
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
