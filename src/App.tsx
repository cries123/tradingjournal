import { useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { FiltersBar } from './components/FiltersBar';
import { Sidebar } from './components/Sidebar';
import { DayDetailModal, TradeModal } from './components/TradeModal';
import { useTrades } from './hooks/useTrades';

export default function App() {
  const {
    trades,
    allTrades,
    filters,
    setFilters,
    symbols,
    setups,
    addTrade,
    deleteTrade,
    resetToSample,
    clearAll,
  } = useTrades();

  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(3);
  const [showTradeModal, setShowTradeModal] = useState(false);
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
    <div className="flex min-h-screen">
      <Sidebar activeView="calendar" onAddTrade={() => openAddTrade()} />

      <main className="flex-1 p-6 overflow-auto">
        <FiltersBar
          filters={filters}
          symbols={symbols}
          setups={setups}
          onChange={setFilters}
        />

        <CalendarView
          year={year}
          month={month}
          trades={trades}
          onDayClick={setSelectedDay}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />

        <div className="mt-8 pt-4 border-t border-border flex gap-4 text-xs text-text-secondary">
          <button type="button" onClick={resetToSample} className="hover:text-text-primary transition-colors">
            Load sample data
          </button>
          <button type="button" onClick={clearAll} className="hover:text-red-400 transition-colors">
            Clear all trades
          </button>
        </div>
      </main>

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
