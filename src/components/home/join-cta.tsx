'use client';

import Link from 'next/link';
import { useAuth } from '@kizuna/core/client/providers/auth-provider';
import { buttonVariants } from '@kizuna/core/client/components/ui/button';
import { cn } from '@kizuna/core/lib/utils';
import type { AppMessages } from '@/i18n/messages';

type HomeMessages = AppMessages['home'];

export function JoinCta({ t }: { t: HomeMessages }) {
  const { user } = useAuth();
  // Logged-in providers jump straight to the wizard; visitors get the pitch + login.
  const href = user ? '/painel/meus-servicos/novo' : '/seja-prestador';

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="home-ink overflow-hidden rounded-3xl border border-white/10 px-6 py-12 sm:px-12 sm:py-16">
        <p className="text-sm font-medium text-white/60">{t.joinKicker}</p>
        <h2 className="mt-2 max-w-[18ch] font-display text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1] tracking-[-0.03em]">
          {t.joinTitle}
        </h2>
        <p className="mt-4 max-w-[46ch] text-white/70">{t.joinText}</p>
        <Link
          href={href}
          className={cn(
            buttonVariants({ size: 'lg' }),
            'mt-7 rounded-xl bg-white px-6 text-neutral-900 hover:bg-white/90'
          )}
        >
          {t.joinCta}
        </Link>
      </div>
    </section>
  );
}
