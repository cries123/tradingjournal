import { useEffect, useMemo, useState } from 'react';
import { AuthModal } from '../components/AuthModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DashboardView } from '../components/DashboardView';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { DayDetailDrawer } from '../components/DayDetailDrawer';
import { MobileBottomNav, MobileHeader } from '../components/MobileNav';
import { MoreContent } from '../components/more/MoreContent';
import { OnboardingOverlay } from '../components/OnboardingOverlay';
import { hasCompletedOnboarding, hideGettingStarted, isGettingStartedHidden } from '../utils/onboarding';
import { GettingStartedCard } from '../components/onboarding/GettingStartedCard';
import { useEntitlement } from '../context/useEntitlement';
import type { OnboardingStepId } from '../utils/onboardingSteps';
import { SettingsPage } from '../components/SettingsPage';
import { Sidebar, type SidebarAppView } from '../components/Sidebar';
import { BrokerConnectContent } from '../components/brokers/BrokerConnectContent';
import { LockedFeature } from '../components/plan/LockedFeature';
import { BrokersContent } from '../components/support/BrokersContent';
import { ReportBugContent } from '../components/support/ReportBugContent';
import { SupportDashboard } from '../components/support/SupportDashboard';
import { AssistantContent } from '../components/analytics/AssistantContent';
import { RuleStandingBanner } from '../components/RuleStandingBanner';
import { CoachNotesPanel } from '../components/coach/CoachNotesPanel';
import { CoachInboxContent } from '../components/coach/CoachInboxContent';
import { AccountMenu } from '../components/account/AccountMenu';
import { RuleSimulatorContent } from '../components/simulator/RuleSimulatorContent';
import { TrackRecordContent } from '../components/trackRecord/TrackRecordContent';
import { Search as SearchIcon } from 'lucide-react';
import { JournalSearch } from '../components/search/JournalSearch';
import { AccountSettingsContent } from '../components/account/AccountSettingsContent';
import { SubscriptionContent } from '../components/account/SubscriptionContent';
import { OrderHistoryContent } from '../components/account/OrderHistoryContent';
import { PerformanceContent } from '../components/PerformanceContent';
import { MonthlyReportView } from '../components/report/MonthlyReportView';
import { CsvImportModal } from '../components/CsvImportModal';
import { TradeModal } from '../components/TradeModal';
import { UsernameSetupModal } from '../components/UsernameSetupModal';
import { useAuth } from '../context/useAuth';
import { useSettings } from '../context/useSettings';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useJournalReminder } from '../hooks/useJournalReminder';
import { useTrades } from '../hooks/useTrades';
import type { Trade } from '../types';
import { computeStats, getMonthTrades, getYearTrades } from '../utils/stats';
import { takePendingAppView } from '../utils/pendingAppView';
import { AssistantDock } from '../components/analytics/AssistantDock';
import { formatMonthYear } from '../utils/format';
import { checkRuleViolations } from '../utils/tradingRules';
import { currentView, popView, pushView } from '../utils/viewStack';
import { JournalOfflineBanner } from '../components/JournalOfflineBanner';
import { InAppProvider } from '../components/layout/PageFrame';
import { trackSpotlight } from '../utils/spotlight';

interface JournalAppProps {
  onHome?: () => void;
  onAdmin?: () => void;
}

type AppView = SidebarAppView;

export function JournalApp({ onHome, onAdmin }: JournalAppProps) {
  const isDesktop = useIsDesktop();
  const { user, loading, firebaseEnabled, needsUsername, profileLoading } = useAuth();
  const { settings, viewingAllJournals } = useSettings();
  /* The assistant reports breaches of the trader's limits — for one account. In the all-journals
     view its trades are every journal, so it is given no rules there rather than adding a paper
     journal's trades to a live account's daily cap. Same reasoning as the breach list. */
  const assistantRules = viewingAllJournals ? undefined : settings.tradingRules;
  const {
    trades,
    allTrades,
    activeJournalTrades,
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

  /*
   * The days the calendar marks as rule breaks, from the active journal alone — the same scope as
   * the rule banner. In the all-journals view the limits were set for one account, so judging the
   * sum of several against them would mark breaches no account had; there, nothing is marked.
   */
  const ruleDates = useMemo(
    () =>
      viewingAllJournals || !settings.tradingRules.enabled
        ? new Set<string>()
        : new Set(checkRuleViolations(activeJournalTrades, settings.tradingRules).map((v) => v.date)),
    [viewingAllJournals, settings.tradingRules, activeJournalTrades],
  );

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  // Open straight to the broker screen when the URL asks for it, so the landing page's
  // "Connect a broker" button lands where it says it will instead of dropping you on the
  // dashboard to go find it. Also covers SnapTrade's post-connect redirect (?brokerConnected=1).
  const [viewStack, setViewStack] = useState<AppView[]>(() => {
    if (typeof window === 'undefined') return ['dashboard'];
    /*
     * Either a marketing page asked for a specific screen — the broker flow, or one of the account
     * screens from the nav dropdown — or SnapTrade just redirected the user back here after they
     * approved a connection. The dashboard always stays underneath, so Back has somewhere to go.
     *
     * Taken once, before the brokerConnected check, because takePendingAppView CLEARS what it
     * reads: calling it inside a short-circuit would leave a pending view sitting in sessionStorage
     * to ambush the next mount.
     */
    const pending = takePendingAppView();
    if (new URLSearchParams(window.location.search).has('brokerConnected')) {
      return ['dashboard', 'connect-broker'];
    }
    return pending ? ['dashboard', pending] : ['dashboard'];
  });

  const appView = currentView(viewStack, 'dashboard');
  /** Drill into a screen, remembering the one being left. */
  const openView = (next: AppView) => setViewStack((stack) => pushView(stack, next));
  /** Back: the screen before this one, whatever it was. */
  const goBackView = () => setViewStack((stack) => popView(stack, 'dashboard'));
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  /** The day a CSV import was started from, so rows with no date of their own land there. */
  const [importTargetDate, setImportTargetDate] = useState<string | undefined>(undefined);
  const [tradeModalDate, setTradeModalDate] = useState<string | undefined>();
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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

  /*
   * The CSV importer, reachable again.
   *
   * It was wired here until the commit that added broker sync, which dropped the entry point and
   * left the modal and all three parsers in the tree with nothing linking to them. Meanwhile the
   * terms of service and the Brokers page both went on telling customers CSV import works — and on
   * the Brokers page that sentence is the answer given to visitors whose broker is not connectable
   * yet, for whom a CSV is the only way in at all.
   *
   * The screenshot importer stays retired, deliberately.
   */
  const openImportCsv = (date?: string) => {
    setImportTargetDate(date);
    setShowCsvModal(true);
  };

  const closeImportCsv = () => {
    setShowCsvModal(false);
    setImportTargetDate(undefined);
  };

  const sidebarActions = {
    appView,
    onDashboard: () => openView('dashboard'),
    onAddTrade: () => openAddTrade(),
    onConnectBroker: () => openView('connect-broker'),
    onSettings: () => openView('settings'),
    onSupport: () => openView('support'),
    onPerformance: () => openView('performance'),
    onSimulator: () => openView('simulator'),
    onTrackRecord: () => openView('track-record'),
    onAssistant: () => openView('assistant'),
    onCoach: () => openView('coach'),
    onAccount: () => openView('account'),
    onSubscription: () => openView('subscription'),
    onOrderHistory: () => openView('order-history'),
    onAdmin,
  };

  const [searchOpen, setSearchOpen] = useState(false);

  /*
   * Ctrl+K / ⌘K opens search, the shortcut every app the trader also uses has taught them. The
   * sidebar's search row names it, so it is discoverable rather than a secret.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * The phone header's tools: search, and the account dropdown in the corner the marketing nav puts
   * it in. Desktop has no top bar any more — both live in the sidebar, the search row at its top and
   * the account behind the profile row at its foot — so this is the phone's alone.
   */
  const headerTools = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search your journal"
        title="Search your journal"
        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
      >
        <SearchIcon size={17} />
      </button>
      <AccountMenu
        onAccount={sidebarActions.onAccount}
        onSubscription={sidebarActions.onSubscription}
        onOrderHistory={sidebarActions.onOrderHistory}
      />
    </div>
  );

  return (
    <div
      /* app-spotlight: the cards' hover glow, in the theme accent; one listener for the whole app. */
      onPointerMove={trackSpotlight}
      className={`app-spotlight flex w-full bg-bg-primary dashboard-bg ${
        isDesktop ? 'min-h-dvh' : 'h-full min-h-0 flex-1 flex flex-col overflow-hidden'
      }`}
    >
      {/* No starfield behind the journal since the rebrand: on pure black the specks read as dust
          on the screen, and the surfaces are the only thing that should sit on it. The auth and
          username modals keep theirs — a full-screen moment, not a page of numbers. */}
      {isDesktop && (
        <Sidebar
          onHome={onHome}
          {...sidebarActions}
          onSearch={() => setSearchOpen(true)}
          trades={everyTrade}
          year={year}
          month={month}
          hasBrokerTrades={hasBrokerTrades}
        />
      )}

      <div className={`relative flex-1 flex flex-col min-w-0 w-full ${isDesktop ? '' : 'min-h-0'}`}>
        {!isDesktop && <MobileHeader onHome={onHome} account={headerTools} />}

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
           <InAppProvider>
            {syncError && <JournalOfflineBanner message={syncError} />}
            {/*
              Keyed on the screen, so moving between screens fades the new one in rather than
              swapping it in a single frame — the app's screens were the one place nothing moved.
              The dashboard's loading skeleton has its own key, so the real dashboard fades in over
              it instead of replacing it with a jump.
            */}
            <div key={appView === 'dashboard' && isLoading ? 'dashboard-loading' : appView} className="animate-page-in">
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
                onSubscription={() => openView('subscription')}
                onAccount={() => openView('account')}
              />
            ) : appView === 'brokers' ? (
              <BrokersContent onBack={goBackView} />
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
                /* Describes the half that draws from an import alone. The previous copy promised
                   time of day, setups and R multiples — three things a broker feed does not carry,
                   which is a paywall selling the panels a synced trader cannot fill. */
                description="See the win rate your payoff ratio actually needs, whether your losing trades are the bigger ones, what the trade after a loss costs you, and how much of your gross went to commissions."
              >
                <PerformanceContent
                  trades={allTrades}
                  year={year}
                  month={month}
                  onBack={goBackView}
                />
              </LockedFeature>
            ) : appView === 'simulator' ? (
              <LockedFeature
                feature="ruleSimulator"
                title="The rule simulator is a paid feature"
                description="Replay your own journal against a daily stop or a trade cap and see what it would have cost you — or saved you. Your trades, your days, no market data required."
              >
                <RuleSimulatorContent periods={assistantPeriods} onBack={goBackView} />
              </LockedFeature>
            ) : appView === 'track-record' ? (
              <LockedFeature
                feature="trackRecord"
                title="A verified track record is part of a paid plan"
                description="Publish a public page built only from the trades your broker sent us, with anything you typed in left out and counted. You choose whether it shows dollar amounts or your name."
              >
                {/* everyTrade, not `trades`: a record is a claim about the trader, so it spans
                    every journal and ignores whatever filter the dashboard has on. This is also
                    the set the server reads, so the preview matches what gets published. */}
                <TrackRecordContent trades={everyTrade} onBack={goBackView} />
              </LockedFeature>
            ) : appView === 'assistant' ? (
              <LockedFeature
                feature="aiAssistant"
                title="The trading assistant is a paid feature"
                description="Ask your journal why a setup keeps losing, whether you cut winners early, or what changed since last month. It reads the stats your dashboard already computed."
                /* With the Performance screen (Silver) the opening findings are shown for real —
                   they are computed in the browser and cost nothing — and only the chat is locked.
                   Free keeps the lock: the findings are the Performance screen's analysis. */
                previewFeature="performanceAnalytics"
                preview={
                  <AssistantContent periods={assistantPeriods} rules={assistantRules} onBack={goBackView} chatLocked />
                }
              >
                <AssistantContent
                  periods={assistantPeriods}
                  rules={assistantRules}
                  onBack={goBackView}
                />
              </LockedFeature>
            ) : appView === 'account' ? (
              <AccountSettingsContent onBack={goBackView} />
            ) : appView === 'subscription' ? (
              <SubscriptionContent
                onBack={goBackView}
                onOrderHistory={() => openView('order-history')}
              />
            ) : appView === 'order-history' ? (
              <OrderHistoryContent onBack={goBackView} />
            ) : appView === 'coach' ? (
              <CoachInboxContent onBack={goBackView} />
            ) : appView === 'support' ? (
              <SupportDashboard
                onBack={goBackView}
                onBrokers={() => openView('brokers')}
              />
            ) : appView === 'report' ? (
              <LockedFeature
                feature="monthlyReport"
                title="The monthly report is a paid feature"
                description="One month of your journal on a page — the figures, the calendar, your symbols and your own rules — downloaded as a PDF to keep or to send to a mentor."
              >
                {/* allTrades: the journal as the screens show it, one journal or all of them, and
                    without the dashboard's filters — a report is the whole month. */}
                <MonthlyReportView
                  trades={allTrades}
                  year={year}
                  month={month}
                  onPrevMonth={handlePrevMonth}
                  onNextMonth={handleNextMonth}
                  onBack={goBackView}
                />
              </LockedFeature>
            ) : appView === 'report-bug' ? (
              <ReportBugContent onBack={goBackView} />
            ) : appView === 'more' ? (
              <MoreContent
                trades={everyTrade}
                year={year}
                month={month}
                hasBrokerTrades={hasBrokerTrades}
                onConnectBroker={sidebarActions.onConnectBroker}
                onSimulator={sidebarActions.onSimulator}
                onTrackRecord={sidebarActions.onTrackRecord}
                onReport={() => openView('report')}
                onCoach={sidebarActions.onCoach}
                onSettings={sidebarActions.onSettings}
                onSubscription={sidebarActions.onSubscription}
                onOrderHistory={sidebarActions.onOrderHistory}
                onSupport={sidebarActions.onSupport}
                onAdmin={onAdmin}
              />
            ) : isLoading ? (
              <DashboardSkeleton />
            ) : (
              <>
                {/* Above everything: a limit you are about to break outranks a checklist. */}
                {/*
                  The ACTIVE journal, like every other surface that reads these rules.

                  This was handed everyTrade — the union of every journal, which useTrades documents
                  as being for full backups. So a paper journal counted against a limit set for the
                  live one: two live trades and two paper ones under a cap of four produced "that is
                  trade 4 of 4, the next one breaks your own limit" directly above a breach list,
                  computed from the filtered journal, that reported nothing at all.
                */}
                {/* activeJournalTrades, not allTrades: in the all-journals view allTrades is every
                    journal, and a limit is set for one account. */}
                <RuleStandingBanner trades={activeJournalTrades} />
                <CoachNotesPanel />

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
                  onOpenReport={() => openView('report')}
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
                  onImportCsv={() => openImportCsv()}
                  sampleActive={sampleActive}
                  onLoadSample={loadSampleData}
                  onClearSample={clearSampleData}
                  ruleDates={ruleDates}
                  /* The active journal, unfiltered: a limit is set for one account, and a symbol
                     filter must not hide the trade that broke it. */
                  ruleTrades={activeJournalTrades}
                  onSetRules={() => openView('settings')}
                  onOpenPerformance={() => openView('performance')}
                />
              </>
            )}
            </div>
           </InAppProvider>
          </div>
        </main>

        {!isDesktop && (
          <MobileBottomNav
            appView={appView}
            onMore={() => openView('more')}
            onAddTrade={() => openAddTrade()}
            onDashboard={() => openView('dashboard')}
            onPerformance={() => openView('performance')}
            onAssistant={() => openView('assistant')}
            assistantOpen={assistantOpen}
          />
        )}
      </div>

      <AssistantDock
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        periods={assistantPeriods}
        rules={assistantRules}
        /* No floating bubble while the Assistant tab is open — it would sit on top of the very
           panel it opens. */
        showLauncher={isDesktop && appView !== 'assistant'}
      />

      {showOnboarding && !showAuthModal && !showUsernameModal && appView === 'dashboard' && (
        <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
      )}

      {searchOpen && (
        <JournalSearch
          trades={everyTrade}
          onClose={() => setSearchOpen(false)}
          onOpenDay={(date) => {
            setSelectedDay(date);
            openView('dashboard');
          }}
        />
      )}
      {showAuthModal && <AuthModal />}

      {showUsernameModal && <UsernameSetupModal />}

      {clearConfirmStage === 1 && (
        <ConfirmDialog
          title={`Clear "${activeJournalName}"?`}
          message={`This deletes all ${activeJournalTrades.length} trade${activeJournalTrades.length === 1 ? '' : 's'} in "${activeJournalName}" only. Your other journals are not touched.`}
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

      {showCsvModal && (
        <CsvImportModal
          targetDate={importTargetDate}
          onClose={closeImportCsv}
          // addTrades is the same path the broker sync writes through, so the dedupe, the journal
          // assignment and the Firestore batching are all the ones already in use. The modal awaits
          // it and closes itself on success; on failure it stays open with the preview intact.
          onSave={(imported) => addTrades(imported)}
        />
      )}

      {selectedDay && (
        <DayDetailDrawer
          date={selectedDay}
          trades={allTrades}
          onClose={() => setSelectedDay(null)}
          onDelete={deleteTrade}
          onEdit={openEditTrade}
          onImportCsv={() => {
            openImportCsv(selectedDay);
            setSelectedDay(null);
          }}
          onAddTrade={() => {
            openAddTrade(selectedDay);
            setSelectedDay(null);
          }}
        />
      )}
    </div>
  );
}
