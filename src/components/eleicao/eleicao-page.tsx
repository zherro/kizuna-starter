'use client';

import { useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { A11yBar } from './a11y-bar';
import { PrefsProvider, useA11yPrefsState } from './prefs';
import { ResultsPanel } from './results-panel';
import { TsePanel } from './tse-panel';
import { useEleicao } from './use-eleicao';

type Tab = 'results' | 'tse';

export function EleicaoPage() {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [tab, setTab] = useState<Tab>('results');
  const [tseOpened, setTseOpened] = useState(false);
  const s = useEleicao(true);
  const prefsApi = useA11yPrefsState();
  const { prefs, fontScale } = prefsApi;

  const openTab = (next: Tab) => {
    setTab(next);
    if (next === 'tse') setTseOpened(true);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'results', label: t.tabResults },
    { id: 'tse', label: t.tabTse },
  ];

  return (
    <PrefsProvider value={prefsApi}>
      {/* O <main> já vem do layout do site: aqui um div, para não duplicar o landmark. */}
      <div
        id="el-main"
        className="eleicao-root mx-auto w-full max-w-3xl px-4 pb-24 pt-3 sm:px-6 sm:pt-6 lg:max-w-[var(--el-max)]"
        style={{ '--el-scale': fontScale } as CSSProperties}
      >
        <a href="#el-resultados" className="el-skip">
          {t.skipToResults}
        </a>

        <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {t.title}
            </h1>
            <p className="mt-1 hidden max-w-xl text-base text-muted-foreground sm:block">{t.subtitle}</p>
          </div>
          <A11yBar />
        </header>

        <nav aria-label={t.pagesLabel} className="mb-3 grid grid-cols-2 gap-2">
          {tabs.map((o) => {
            const on = tab === o.id;
            return (
              <button
                key={o.id}
                type="button"
                className="el-tab"
                aria-current={on ? 'page' : undefined}
                onClick={() => openTab(o.id)}
              >
                {on && <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden="true" />}
                <span>{o.label}</span>
              </button>
            );
          })}
        </nav>

        <div id="eleicao-panel-results" hidden={tab !== 'results'}>
          <ResultsPanel s={s} active={tab === 'results'} />
        </div>

        <div id="eleicao-panel-tse" hidden={tab !== 'tse'}>
          {tseOpened && <TsePanel />}
        </div>

        <p className="mt-6 text-center text-base text-muted-foreground">{t.disclaimer}</p>
      </div>
    </PrefsProvider>
  );
}
