import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import type { AppMessages } from '@/i18n/messages';
import { HOME_PROS, type HomePro } from './mock-data';

type HomeMessages = AppMessages['home'];

// Content-driven bento: the first pro is featured (dark card, spans two rows), the
// rest fill in around it. Spans only kick in at lg — below that it's a plain
// 1/2-col stack.
const SPANS = [
  'sm:col-span-2 sm:row-span-2 lg:col-span-3 lg:row-span-2',
  'lg:col-span-3',
  'lg:col-span-3',
  'lg:col-span-2',
  'lg:col-span-2',
  'lg:col-span-2',
];

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

function Rating({ pro, muted }: { pro: HomePro; muted?: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${muted ? 'text-white' : 'text-foreground'}`}>
      <Star className="h-3.5 w-3.5 fill-current text-primary" aria-hidden="true" />
      {pro.rating.toFixed(1)}
      <span className={muted ? 'text-white/50' : 'text-muted-foreground'}>({pro.reviews})</span>
    </span>
  );
}

function FeaturedCard({ pro }: { pro: HomePro }) {
  return (
    <Link
      href={`/busca?q=${encodeURIComponent(pro.trade)}`}
      className="home-ink home-ink-featured flex h-full flex-col rounded-2xl border p-6 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 font-display text-base font-bold text-white">
            {initials(pro.name)}
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-tight text-white">{pro.name}</p>
            <p className="text-sm text-white/60">{pro.trade}</p>
          </div>
        </div>
        {pro.availableToday ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/20 px-2 py-1 text-xs font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            livre hoje
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-base leading-7 text-white/75">{pro.blurb}</p>

      {pro.skills ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {pro.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-6 text-sm">
        <span className="flex items-center gap-1.5 font-mono text-xs text-white/55">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {pro.area}
        </span>
        <Rating pro={pro} muted />
      </div>
    </Link>
  );
}

function ProCard({ pro }: { pro: HomePro }) {
  return (
    <Link
      href={`/busca?q=${encodeURIComponent(pro.trade)}`}
      className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted font-display text-sm font-bold text-foreground">
            {initials(pro.name)}
          </span>
          <div>
            <p className="font-semibold text-foreground">{pro.name}</p>
            <p className="text-sm text-muted-foreground">{pro.trade}</p>
          </div>
        </div>
        {pro.availableToday ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-xs font-medium text-accent-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            livre hoje
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">{pro.blurb}</p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 font-mono text-xs">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {pro.area}
        </span>
        <Rating pro={pro} />
      </div>
    </Link>
  );
}

export function NearbyGrid({ t }: { t: HomeMessages }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.02em] text-foreground">
        {t.nearbyTitle}
      </h2>
      <p className="mt-2 max-w-[52ch] text-muted-foreground">{t.nearbySub}</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {HOME_PROS.map((pro, i) => (
          <div key={pro.name} className={SPANS[i]}>
            {i === 0 ? <FeaturedCard pro={pro} /> : <ProCard pro={pro} />}
          </div>
        ))}
      </div>
    </section>
  );
}
