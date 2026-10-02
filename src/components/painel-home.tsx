'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { buttonVariants } from '@kizuna/core/client/components/ui/button';
import { cn } from '@kizuna/core/lib/utils';
import { useOwnerStats } from '@kizuna/core/client/analytics';
import { FEATURED_METRICS, formatMetric } from '@/lib/analytics-metrics';

type Slide = {
  eyebrow: string;
  title: string;
  text: string;
  icon: LucideIcon;
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
  progress?: { value: number; label: string };
};

// Dados de exemplo (front apenas) — trocar por dados reais quando a API existir.
const slides: Slide[] = [
  {
    eyebrow: 'Meu painel',
    title: 'Bem-vindo de volta',
    text: 'Acompanhe como seus anúncios estão performando e responda quem já demonstrou interesse.',
    icon: Sparkles,
    cta: { label: 'Ver meus serviços', href: '/painel/meus-servicos' },
    secondary: { label: 'Ver site', href: '/' },
  },
  {
    eyebrow: 'Ação recomendada',
    title: 'Complete seu perfil e ganhe confiança',
    text: 'Perfis completos recebem até 3x mais contatos. Faltam poucos passos para chegar a 100%.',
    icon: ShieldCheck,
    cta: { label: 'Completar perfil', href: '/painel/minha-conta' },
    progress: { value: 70, label: '70% completo' },
  },
  {
    eyebrow: 'Dica',
    title: 'Destaque seu melhor anúncio',
    text: 'Anúncios em destaque aparecem primeiro nas buscas da sua região e atraem mais visitas.',
    icon: Rocket,
    cta: { label: 'Destacar anúncio', href: '/painel/meus-servicos' },
  },
  {
    eyebrow: 'Reputação',
    title: 'Peça avaliações aos clientes',
    text: 'Cada avaliação positiva aumenta sua posição e transmite segurança a novos clientes.',
    icon: Star,
    cta: { label: 'Ver avaliações', href: '/painel/meus-servicos' },
  },
];

const AUTOPLAY_MS = 5000;

export function PainelHero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((next: number) => {
    setIndex((next + slides.length) % slides.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Destaques do painel"
      className="relative overflow-hidden rounded-[var(--ui-radius-card-lg,1.5rem)] border border-border bg-card shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_60%)]"
      />
      {/* Slides empilhados na mesma célula, só com fade (sem deslize): a volta do último para o
          primeiro é uma passagem igual às outras (nada de rebobinar por todos os slides). */}
      <div className="relative grid">
        {slides.map((slide, i) => {
          const Icon = slide.icon;
          return (
            <article
              key={slide.title}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${slides.length}`}
              aria-hidden={i !== index}
              className={cn(
                'col-start-1 row-start-1 flex w-full items-center gap-6 px-6 py-8 transition-opacity duration-700 ease-in-out motion-reduce:transition-none md:px-10 md:py-10',
                i === index ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">
                  {slide.eyebrow}
                </p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                  {slide.title}
                </h1>
                <p className="mt-3 max-w-xl text-sm text-muted-foreground">{slide.text}</p>
                {slide.progress ? (
                  <div className="mt-4 max-w-xs">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${slide.progress.value}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{slide.progress.label}</p>
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={slide.cta.href}
                    tabIndex={i === index ? 0 : -1}
                    className={buttonVariants()}
                  >
                    {slide.cta.label}
                  </Link>
                  {slide.secondary ? (
                    <Link
                      href={slide.secondary.href}
                      tabIndex={i === index ? 0 : -1}
                      className={buttonVariants({ variant: 'outline' })}
                    >
                      {slide.secondary.label}
                    </Link>
                  ) : null}
                </div>
              </div>
              <div
                aria-hidden
                className="hidden h-32 w-32 shrink-0 items-center justify-center rounded-3xl bg-primary/10 text-primary sm:flex md:h-40 md:w-40"
              >
                <Icon className="h-14 w-14 md:h-16 md:w-16" strokeWidth={1.5} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="relative flex items-center justify-between px-6 pb-4 md:px-10">
        <div className="flex items-center gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Ir para o destaque ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index
                  ? 'w-6 bg-primary'
                  : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Destaque anterior"
            onClick={() => go(index - 1)}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próximo destaque"
            onClick={() => go(index + 1)}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function PainelStats() {
  const { stats } = useOwnerStats(30);
  return (
    <section aria-label="Resumo dos últimos 30 dias" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Resumo · últimos 30 dias</h2>
        <Link href="/painel/metricas" className="text-xs font-medium text-primary hover:underline">
          Ver todas as métricas
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        {FEATURED_METRICS.map((metric) => {
          const Icon = metric.icon;
          const { value, delta } = stats?.metrics[metric.id] ?? { value: null, delta: 0 };
          const up = delta > 0;
          const down = delta < 0;
          const Trend = down ? ArrowDownRight : ArrowUpRight;
          return (
            <Link
              key={metric.id}
              href="/painel/metricas"
              className="group flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 sm:p-4"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-primary/10 p-1.5 text-primary sm:p-2">
                  <Icon className="h-4 w-4" />
                </span>
                {delta !== 0 ? (
                  <span
                    className={cn(
                      'inline-flex items-center text-[11px] font-medium',
                      up && 'text-emerald-600 dark:text-emerald-400',
                      down && 'text-destructive',
                    )}
                  >
                    <Trend className="h-3 w-3" />
                    {Math.abs(delta)}%
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {value === null ? '—' : formatMetric(metric.format, value)}
                </p>
                <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                  {metric.label}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
