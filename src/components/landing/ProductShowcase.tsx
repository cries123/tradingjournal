import { useMemo } from 'react';
import { BreakevenPanel, LoadPanel, SequencePanel } from '../analytics/BrokerInsightSection';
import { brokerCoverage } from '../../utils/brokerAnalytics';
import { demoJournal } from './landingDemo';

/**
 * The Performance screen's own panels, drawn from the sample journal.
 *
 * The landing page described these in twelve-point grey text inside an icon grid — "win rate, profit
 * factor and expectancy" — while the actual panels, which say things like "you need 54% to break even
 * and you win 45%", never appeared. These are the real components, so they cannot drift from the
 * product, fed the same sample journal the simulator demo below replays. Loaded only as the section
 * nears the screen.
 */
export default function ProductShowcase() {
  const coverage = useMemo(() => brokerCoverage(demoJournal()), []);

  const tiles = [
    {
      caption: 'The win rate your payoff actually needs — and how far off it you are.',
      panel: coverage.breakeven && <BreakevenPanel data={coverage.breakeven} />,
    },
    {
      caption: 'Which trade of the day makes the money, and which one gives it back.',
      panel: coverage.sequence.length > 1 && <SequencePanel rows={coverage.sequence} currency="USD" />,
    },
    {
      caption: 'Quiet days against busy ones — what overtrading costs, in dollars a day.',
      panel: coverage.load.length > 1 && <LoadPanel rows={coverage.load} currency="USD" />,
    },
  ];

  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-3">
      {tiles.map((tile, i) => (
        <div
          key={tile.caption}
          className="flex flex-col gap-3 motion-safe:animate-fade-up"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <p className="text-sm text-slate-300/90 leading-relaxed px-1">{tile.caption}</p>
          <div className="spotlight rounded-xl [&>*]:h-full flex-1">{tile.panel}</div>
        </div>
      ))}
    </div>
  );
}
