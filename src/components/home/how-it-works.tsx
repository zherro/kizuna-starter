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
            <li key={step.n} className="mx-auto flex w-full max-w-xs items-start gap-4 text-left lg:gap-5">
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {step.n}
                </span>
              </span>
              <div className="min-w-0">
                <h3 className="text-2xl font-light leading-tight tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
