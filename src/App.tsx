import { useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { DashboardView } from './components/DashboardView';
import { Sidebar } from './components/Sidebar';
import { CsvImportModal } from './components/CsvImportModal';
import { ScreenshotImportModal } from './components/ScreenshotImportModal';
import { DayDetailModal, TradeModal } from './components/TradeModal';
import { useAuth } from './context/AuthContext';
import { useTrades } from './hooks/useTrades';

export default function App() {
  const { user, loading, firebaseEnabled } = useAuth();
  const {
    trades,
    allTrades,
    addTrade,
    addTrades,
    deleteTrade,
    clearAll,
  } = useTrades();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [tradeModalDate, setTradeModalDate] = useState<string | undefined>();
  const [importTargetDate, setImportTargetDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const showAuthModal = firebaseEnabled && !loading && !user;

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

  return (
    <div className="flex h-full bg-bg-primary overflow-hidden">
      <Sidebar
        onAddTrade={() => openAddTrade()}
        onImportScreenshot={() => openImportScreenshot()}
        onImportCsv={() => openImportCsv()}
        onClearAll={() => void clearAll()}
      />

      <main className="flex-1 min-w-0 min-h-0 p-3 overflow-hidden">
        <DashboardView
          trades={trades}
          year={year}
          month={month}
          onDayClick={setSelectedDay}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />
      </main>

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
        <DayDetailModal
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
