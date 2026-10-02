'use client';

import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
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

function InstagramCard({ t, url }: { t: HomeMessages; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8"
      style={{
        backgroundImage: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 45%, #8134af 75%, #515bd4 100%)',
      }}
    >
      <InstagramGlyph className="h-10 w-10" />
      <div>
        <h3 className="font-display text-2xl font-extrabold leading-tight tracking-tight">{t.instagramTitle}</h3>
        <p className="mt-2 max-w-[40ch] text-sm text-white/85">{t.instagramText}</p>
      </div>
      <span className="inline-flex w-fit items-center rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-neutral-900 transition group-hover:bg-white/90">
        {t.instagramCta}
      </span>
    </a>
  );
}

function InstallCard({ t }: { t: HomeMessages }) {
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

  if (installed) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  }

  return (
    <div className="home-ink relative flex flex-col justify-between gap-6 overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8">
      <Download className="h-10 w-10" />
      <div>
        <h3 className="font-display text-2xl font-extrabold leading-tight tracking-tight">{t.installTitle}</h3>
        <p className="mt-2 max-w-[40ch] text-sm text-white/70">{t.installText}</p>
        {ios && !prompt ? (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-white/85">
            {t.installIosPre} <Share className="h-4 w-4" /> {t.installIosMid} <SquarePlus className="h-4 w-4" />{' '}
            <strong>{t.installIosPost}</strong>
          </p>
        ) : null}
      </div>
      {prompt ? (
        <button
          type="button"
          onClick={install}
          className="w-fit rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-neutral-900 transition hover:bg-white/90"
        >
          {t.installCta}
        </button>
      ) : !ios ? (
        <p className="text-xs text-white/60">{t.installHint}</p>
      ) : null}
    </div>
  );
}

/** Dois cards lado a lado (empilham no mobile): seguir no Instagram e instalar o app (PWA). */
export function SocialInstallCards({ t, instagramUrl }: { t: HomeMessages; instagramUrl?: string }) {
  return (
    <section className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 pb-16 sm:px-6 md:grid-cols-2">
      {instagramUrl ? <InstagramCard t={t} url={instagramUrl} /> : null}
      <InstallCard t={t} />
    </section>
  );
}
