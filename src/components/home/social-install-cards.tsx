'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Download, Share, SquarePlus } from 'lucide-react';
import type { AppMessages } from '@/i18n/messages';

type HomeMessages = AppMessages['home'];

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** Estado do PWA: instalado (standalone), evento de instalação disponível e iOS (sem evento). */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  }

  return { prompt, installed, ios, install };
}

const CARD = 'flex items-center gap-4 rounded-2xl p-4';

function InstagramCard({ t, url }: { t: HomeMessages; url: string }) {
  return (
    // Discreto de propósito: o público já chega pelo Instagram, então aqui é só um atalho.
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 text-foreground transition-colors hover:bg-muted"
    >
      <InstagramGlyph className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.instagramCta}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  );
}

function InstallCard({ t, state }: { t: HomeMessages; state: ReturnType<typeof useInstallPrompt> }) {
  const { prompt, ios, install } = state;
  return (
    <div className={`home-ink ${CARD} border border-white/10`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
        <Download className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">{t.installTitle}</p>
        {ios && !prompt ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-white/75">
            {t.installIosPre} <Share className="h-3.5 w-3.5" /> {t.installIosMid} <SquarePlus className="h-3.5 w-3.5" />{' '}
            <strong>{t.installIosPost}</strong>
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-white/70">{prompt ? t.installText : t.installHint}</p>
        )}
      </div>
      {prompt ? (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 transition hover:bg-white/90"
        >
          {t.installCta}
        </button>
      ) : null}
    </div>
  );
}

/** "Fique atento": título + dois cards compactos (Instagram e instalar o app/PWA), lado a lado no desktop. */
export function SocialInstallCards({ t, instagramUrl }: { t: HomeMessages; instagramUrl?: string }) {
  const installState = useInstallPrompt();
  const showInstall = !installState.installed;
  if (!instagramUrl && !showInstall) return null;

  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 pb-16 sm:px-6">
      <h2 className="text-center font-display text-xl font-bold tracking-tight text-foreground-display">{t.followTitle}</h2>
      <p className="mt-1 text-center text-sm text-muted-foreground">{t.followText}</p>
      <div className={`mx-auto mt-5 grid gap-3 ${instagramUrl && showInstall ? 'max-w-4xl md:grid-cols-2' : 'max-w-md'}`}>
        {instagramUrl ? <InstagramCard t={t} url={instagramUrl} /> : null}
        {showInstall ? <InstallCard t={t} state={installState} /> : null}
      </div>
    </section>
  );
}
