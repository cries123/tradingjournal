import { BrokerLogo } from '../brokers/BrokerLogo';
import { brokerIdFromName } from '../../utils/brokerIds';

/**
 * The supported brokers, drifting past under the hero in two rows that run opposite ways.
 *
 * The first thing most visitors arrive to check is "does it work with my broker", and the answer is
 * twenty logos rather than a sentence that says twenty. Each row is drawn twice and slid by half its
 * width, which is what makes the loop seamless.
 *
 * Screen readers get the list once, as a plain list; the moving rows are hidden from them. Pauses on
 * hover. Under reduced motion the rows stop and become rows you can scroll yourself.
 */
export function BrokerMarquee({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const half = Math.ceil(names.length / 2);
  const rows = names.length > 6 ? [names.slice(0, half), names.slice(half)] : [names];

  const track = (list: string[], copy: number) => (
    <ul className="flex shrink-0 items-center gap-3.5 pr-3.5">
      {list.map((name) => (
        <li
          key={`${copy}-${name}`}
          className="flex h-16 items-center whitespace-nowrap rounded-2xl border border-white/[0.07] bg-[#141414] pl-2.5 pr-[18px] text-[#d6d6d6]"
        >
          <BrokerLogo broker={brokerIdFromName(name)} compact />
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <ul className="sr-only" aria-label="Supported brokers">
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <div aria-hidden="true" className="grid gap-3.5">
        {rows.map((list, i) => (
          <div key={i} className="marquee-mask overflow-hidden motion-reduce:overflow-x-auto">
            <div
              className={`flex w-max hover:[animation-play-state:paused] motion-reduce:animate-none ${
                i === 0 ? 'animate-marquee' : 'animate-marquee-reverse'
              }`}
            >
              {track(list, 0)}
              {track(list, 1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
