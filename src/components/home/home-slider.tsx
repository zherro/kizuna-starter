'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@kizuna/core/lib/utils';
import { UrnaArt } from './urna-art';

export type HomeSlide = {
  /** chave estável do slide (ex.: "eleicao") */
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  cta: { label: string; href: string };
  /** arte do slide — hoje só "urna" (eleição) */
  art?: 'urna';
  /** selo pulsante "ao vivo" no topo do slide */
  live?: string;
};

type HomeSliderProps = {
  slides: HomeSlide[];
  /** ms entre slides; 0 desliga o autoplay. Com um único slide não há autoplay nem controles. */
  autoplayMs?: number;
};

/**
 * Slider de destaques da home — mesmo padrão do hero do painel (slides empilhados com fade,
 * pausa no hover/foco). Slides vêm de kizuna.config.json (home.slider.slides). Fundo escuro com
 * o laranja do tema, para chamar a atenção entre os blocos claros da home.
 */
export function HomeSlider({ slides, autoplayMs = 6000 }: HomeSliderProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const many = slides.length > 1;

  const go = useCallback(
    (next: number) => setIndex((next + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (!many || paused || autoplayMs <= 0) return;
    const id = window.setTimeout(() => go(index + 1), autoplayMs);
    return () => window.clearTimeout(id);
  }, [many, paused, autoplayMs, index, go]);

  if (slides.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Destaques"
      className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="hs-card relative overflow-hidden rounded-[var(--ui-radius-card-lg,1.5rem)] text-white shadow-lg shadow-primary/20">
        <div aria-hidden className="hs-glow pointer-events-none absolute inset-0" />
        <div aria-hidden className="hs-grid pointer-events-none absolute inset-0" />

        <div className="relative grid">
          {slides.map((slide, i) => (
            <article
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${slides.length}`}
              aria-hidden={i !== index}
              className={cn(
                'col-start-1 row-start-1 flex w-full items-center gap-6 px-6 py-7 transition-opacity duration-700 ease-in-out motion-reduce:transition-none md:gap-10 md:px-10 md:py-9',
                i === index ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <div className="min-w-0 flex-1">
                {slide.live ? (
                  <span className="hs-live mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ring-white/20">
                    <span aria-hidden className="hs-dot h-2 w-2 rounded-full" />
                    {slide.live}
                  </span>
                ) : null}
                <p className="hs-accent text-xs font-semibold uppercase tracking-[0.22em]">
                  {slide.eyebrow}
                </p>
                <h2 className="mt-2 font-serif text-2xl font-bold leading-tight tracking-tight md:text-4xl">
                  {slide.title}
                </h2>
                <p className="mt-3 max-w-xl text-sm text-white/80 md:text-base">{slide.text}</p>
                <Link
                  href={slide.cta.href}
                  tabIndex={i === index ? 0 : -1}
                  className="hs-cta group mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold"
                >
                  <span className="relative z-10">{slide.cta.label}</span>
                  <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
              {slide.art === 'urna' ? (
                <div
                  aria-hidden
                  className="hidden w-36 shrink-0 sm:block md:w-52 lg:w-60"
                >
                  <UrnaArt />
                </div>
              ) : null}
            </article>
          ))}
        </div>

        {many ? (
          <div className="relative flex items-center justify-between px-6 pb-4 md:px-10">
            <div className="flex items-center gap-2">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Ir para o destaque ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => go(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70',
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Destaque anterior"
                onClick={() => go(index - 1)}
                className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Próximo destaque"
                onClick={() => go(index + 1)}
                className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
