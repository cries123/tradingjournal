import { BrokerLogo } from '../brokers/BrokerLogo';
import { brokerIdFromName } from '../../utils/brokerIds';

/**
 * The supported brokers, drifting past under the hero.
 *
 * The broker grid sits a full screen down the page, so a visitor deciding in the first five seconds
 * never saw the one fact most of them arrive to check — "does it work with my broker". A strip in
 * the first screen answers it without a click.
 *
 * The list is drawn twice and slid by half its width, which is what makes the loop seamless; the
 * second copy is hidden from screen readers so the list is announced once. Pauses on hover. Under
 * reduced motion it stops and becomes a row you can scroll yourself.
 */
export function BrokerMarquee({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const row = (copy: number) => (
    <ul
      className="flex shrink-0 items-center gap-2.5 pr-2.5"
      aria-hidden={copy === 1 ? true : undefined}
      aria-label={copy === 0 ? 'Supported brokers' : undefined}
    >
      {names.map((name) => (
        <li
          key={`${copy}-${name}`}
          className="rounded-lg border border-border/50 bg-bg-primary/60 px-3 py-2 flex items-center min-w-[11rem]"
        >
          <BrokerLogo broker={brokerIdFromName(name)} compact />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="marquee-mask overflow-hidden motion-reduce:overflow-x-auto">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
