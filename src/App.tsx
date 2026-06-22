import { useState } from 'react';
import { DashboardView } from './components/DashboardView';
import { Sidebar } from './components/Sidebar';
import { ScreenshotImportModal } from './components/ScreenshotImportModal';
import { DayDetailModal, TradeModal } from './components/TradeModal';
import { useTrades } from './hooks/useTrades';

export default function App() {
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
  const [tradeModalDate, setTradeModalDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar
        onAddTrade={() => openAddTrade()}
        onImportScreenshot={() => setShowImportModal(true)}
      />

      <main className="flex-1 p-5 overflow-auto max-w-6xl">
        <DashboardView
          trades={trades}
          year={year}
          month={month}
          onDayClick={setSelectedDay}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />

        <div className="mt-6 pt-4 border-t border-border text-xs text-text-secondary">
          <button type="button" onClick={clearAll} className="hover:text-red-400 transition-colors">
            Clear all trades
          </button>
        </div>
      </main>

      {showImportModal && (
        <ScreenshotImportModal
          onClose={() => setShowImportModal(false)}
          onSave={addTrades}
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
        />
      )}
    </div>
  );
}
