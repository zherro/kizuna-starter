'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@kizuna/core/client/components/ui/button';
import type { AppMessages } from '@/i18n/messages';

type HomeMessages = AppMessages['home'];

const VERB_INTERVAL_MS = 2200;
const HERO_CHIPS = ['encanador', 'diarista', 'aulas particulares', 'frete', 'eletricista'];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

function useRotatingVerb(verbs: string[], reduced: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduced || verbs.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % verbs.length);
    }, VERB_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [verbs, reduced]);
  return index;
}

export function HomeHero({ t }: { t: HomeMessages }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = usePrefersReducedMotion();

  const verbs = t.heroVerbs
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const verbIndex = useRotatingVerb(verbs, reduced);
  const verb = reduced ? t.heroReducedVerb : (verbs[verbIndex] ?? t.heroReducedVerb);

  function goSearch(term: string) {
    const q = term.trim();
    router.push(q ? `/busca?q=${encodeURIComponent(q)}` : '/busca');
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    goSearch(query);
  }

  return (
    <section className="home-ink border-b border-white/10">
      <div className="mx-auto grid max-w-[1600px] gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-28">
        <div>
          <h1 className="home-rise font-display text-[clamp(2.75rem,8vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
            <span className="block">{t.heroLead}</span>
            <span
              key={verb}
              className="home-verb block"
              style={reduced ? { animation: 'none' } : undefined}
            >
              {verb}
            </span>
            <span className="block text-white/90">{t.heroTail}</span>
          </h1>

          <p className="home-rise mt-6 max-w-[46ch] text-base leading-7 text-white/70 sm:text-lg">
            {t.heroSub}
          </p>

          <form
            className="home-rise mt-8 flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] p-2 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.7)] sm:max-w-xl"
            onSubmit={onSubmit}
          >
            <Search className="ml-2 h-5 w-5 shrink-0 text-white/60" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              className="h-11 min-w-0 flex-1 bg-transparent px-1 text-sm text-white outline-none placeholder:text-white/45"
            />
            <Button type="submit" size="lg" className="rounded-xl">
              {t.searchButton}
            </Button>
          </form>

          <div className="home-rise mt-4 flex flex-wrap gap-2">
            {HERO_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => goSearch(chip)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm lowercase text-white/70 transition-colors hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
