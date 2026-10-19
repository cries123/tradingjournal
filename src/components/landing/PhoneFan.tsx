import { IPhoneFrame } from './IPhoneFrame';
import { shot, type LandingShot } from './landingShots';

const PHONES: { src: LandingShot; alt: string; place: string; float: string }[] = [
  {
    src: 'phone-performance.webp',
    alt: 'Performance on a phone: the month, and where the money went',
    place: 'left-1/2 top-[60px] -translate-x-[calc(50%+120px)] rotate-[-9deg] lg:top-[70px] lg:-translate-x-[calc(50%+300px)] lg:rotate-[-11deg]',
    float: 'phone-float-a',
  },
  {
    src: 'phone-overview.webp',
    alt: 'The Overview on a phone: the month, today against your rules, and the calendar',
    place: 'left-1/2 top-0 z-[2] -translate-x-1/2',
    float: 'phone-float-b',
  },
  {
    src: 'phone-ask.webp',
    alt: 'Asking the journal on a phone why June went red',
    place: 'left-1/2 top-[60px] -translate-x-[calc(50%-120px)] rotate-[9deg] lg:top-[70px] lg:-translate-x-[calc(50%-300px)] lg:rotate-[11deg]',
    float: 'phone-float-c',
  },
];

/**
 * The phone app, as three real screens fanned out — Performance, the Overview, Ask — rather than one
 * small phone. Each floats on its own slow cycle (`translate`, so it never fights the tilt). The labels
 * name what each screen is for, and drop away on a phone, where the fan is narrower than they are.
 */
export function PhoneFan() {
  return (
    <div className="relative mx-auto mt-14 h-[560px] max-w-[1100px] lg:h-[720px]">
      {PHONES.map((p) => (
        <div key={p.src} className={`absolute ${p.place}`}>
          <IPhoneFrame className={`${p.float} [--pw:200px] lg:[--pw:262px]`}>
            <img {...shot(p.src)} alt={p.alt} loading="lazy" decoding="async" />
          </IPhoneFrame>
        </div>
      ))}
      <p className="absolute left-0 top-[270px] z-[3] hidden rounded-xl border border-white/[0.12] bg-[#111]/90 px-3.5 py-2.5 text-[13.5px] backdrop-blur lg:block">
        <b className="block text-[14.5px] font-semibold">Performance</b>
        Breakdowns, biggest first
      </p>
      <p className="absolute right-0 top-[300px] z-[3] hidden rounded-xl border border-white/[0.12] bg-[#111]/90 px-3.5 py-2.5 text-[13.5px] backdrop-blur lg:block">
        <b className="block text-[14.5px] font-semibold">Ask</b>
        Questions about your month
      </p>
    </div>
  );
}
