import { CalendarHeart, Compass, Heart } from 'lucide-react';
import type { AppMessages } from '@/i18n/messages';

type HomeMessages = AppMessages['home'];

const STEP_ICONS = [Compass, Heart, CalendarHeart];

export function HowItWorks({ t }: { t: HomeMessages }) {
  const steps = [
    { n: 1, title: t.step1Title, text: t.step1Text },
    { n: 2, title: t.step2Title, text: t.step2Text },
    { n: 3, title: t.step3Title, text: t.step3Text },
  ];

  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 pb-14 text-center sm:px-6 md:py-20 lg:py-24">
      <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.02em] text-foreground-display">
        {t.howTitle}
      </h2>

      <ol className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-3 md:mt-12">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <li key={step.n}>
              <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {step.n}
                </span>
              </span>
              <h3 className="mt-4 text-2xl font-light tracking-tight text-foreground">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-[36ch] text-sm leading-6 text-muted-foreground">{step.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
