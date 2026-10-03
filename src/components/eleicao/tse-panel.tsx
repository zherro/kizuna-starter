'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';

// URL direta do painel (a raiz só redireciona para ela; o painel não envia X-Frame-Options).
export const TSE_URL = 'https://resultados.tse.jus.br/oficial/app/index.html';
const SLOW_MS = 8000;

/** Aba "Painel oficial do TSE": monta só quando aberta pela primeira vez (lazy), com explicação, aviso de lentidão e botão grande. */
export function TsePanel() {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, [loaded]);

  return (
    <section aria-labelledby="el-tse-title" className="flex flex-col gap-4">
      <div className="el-card p-4 sm:p-5">
        <h2 id="el-tse-title" className="font-display text-2xl font-semibold leading-tight">
          {t.tseTitle}
        </h2>
        <p className="mt-2 max-w-2xl text-base">{t.tseExplain}</p>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">{t.tseHint}</p>
        <a href={TSE_URL} target="_blank" rel="noopener noreferrer" className="el-btn mt-4 w-full sm:w-auto">
          <ExternalLink className="h-6 w-6" aria-hidden="true" />
          {t.tseOpen}
        </a>
      </div>

      {!loaded && slow && (
        <p role="status" className="el-card p-4 text-base font-medium">
          {t.tseSlow}
        </p>
      )}

      <div className="relative h-[calc(100dvh-14rem)] min-h-[420px] overflow-hidden el-card bg-muted">
        {!loaded && (
          <div
            className="el-skeleton-img absolute inset-0 flex items-center justify-center px-6 text-center text-lg font-medium"
            role="status"
          >
            {t.tseLoading}
          </div>
        )}
        <iframe
          src={TSE_URL}
          title={t.tseFrameTitle}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full border-0 bg-white"
        />
      </div>
    </section>
  );
}
