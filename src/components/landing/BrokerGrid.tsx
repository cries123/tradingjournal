import { BrokerLogo } from '../brokers/BrokerLogo';
import { brokerIdFromName } from '../../utils/brokerIds';

/* How many broker logos fit in the bento card before it starts to look like a directory. */
const BROKERS_SHOWN = 8;

/**
 * The broker tiles in the landing page's "Connect once" card.
 *
 * The column count comes from the card's width, not the screen's. It used to be
 * `sm:grid-cols-4`, which is a screen width: from lg the card shares its row with the assistant
 * and is half as wide while the screen keeps growing, so four columns held on into tiles 93px wide
 * and every name broke wherever it ran out — "thinkors / wim" at 1600px, one letter a line at
 * 1024px.
 *
 * Each step is the width at which every tile still holds 90px of name (see BrokerLogo's `fit`):
 * a tile is that plus 24px of padding and 2px of border, 116px, and the gap is 8px. Two columns
 * from 2 × 116 + 8 = 240px (15rem), four from 4 × 116 + 24 = 488px (30.5rem). No three: eight
 * tiles in three columns leave the last row a third empty, and two or four always end level.
 */
export function BrokerGrid({ names }: { names: string[] }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 @min-[15rem]:grid-cols-2 @min-[30.5rem]:grid-cols-4 gap-2">
        {names.slice(0, BROKERS_SHOWN).map((name) => (
          <div key={name} className="@container rounded-2xl bg-black/60 border border-white/5 px-3 py-2.5">
            <BrokerLogo broker={brokerIdFromName(name)} fit />
          </div>
        ))}
      </div>
    </div>
  );
}
