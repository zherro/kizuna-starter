import Link from 'next/link';
import { ArrowRight, Megaphone, PartyPopper, Search } from 'lucide-react';
import type { AppMessages } from '@/i18n/messages';

type HomeMessages = AppMessages['home'];

const STEP_ICONS = [Search, PartyPopper, Megaphone];

export function HowItWorks({ t }: { t: HomeMessages }) {
  const steps: { n: number; title: string; text: string; cta?: { href: string; label: string } }[] = [
    { n: 1, title: t.step1Title, text: t.step1Text },
    { n: 2, title: t.step2Title, text: t.step2Text },
    // Chamada pra anunciar — visitante cai no login e volta (o proxy protege /painel).
    { n: 3, title: t.step3Title, text: t.step3Text, cta: { href: '/painel/meus-servicos/novo', label: t.step3Cta } },
  ];

  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 pb-14 sm:px-6">
      <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.02em] text-foreground-display">
        {t.howTitle}
      </h2>

      <ol className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-3">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <li key={step.n}>
              <div className="flex items-center gap-3.5">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {step.n}
                  </span>
                </span>
                <h3 className="text-2xl font-light tracking-tight text-foreground">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.text}</p>
              {step.cta && (
                <Link
                  href={step.cta.href}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  {step.cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
