'use client';

import { useEffect, useState } from 'react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { DiscoverCta } from '@kizuna/core/client/components/home/discover-cta';
import { HomeHero } from './home/home-hero';
import { CategoryRail } from './home/category-rail';
import { NearbyGrid } from './home/nearby-grid';
import { HowItWorks } from './home/how-it-works';
import { JoinCta } from './home/join-cta';
import {
  getHomeInkStyle,
  HOME_INK_FIXED_LEVEL,
  HOME_INK_LEVELS,
  HOME_INK_STORAGE_KEY,
  HOME_INK_TONE_PICKER_ENABLED,
  type HomeInkLevel,
} from './home/home-ink-config';
import { HomeInkTonePicker } from './home/home-ink-tone-picker';

type HomeContentProps = {
  /** mostra a seção hero (default true) — vem de home.showHero no kizuna.config.json */
  showHero?: boolean;
  /** layout do carrossel de categorias — vem de home.categoriesVariant */
  categoriesVariant?: 'classic' | 'compact';
  /** mostra o banner "Descobrir no swipe" — vem de home.showDiscover */
  showDiscover?: boolean;
  /** mostra o seletor de intensidade do fundo "ink" — vem de home.inkPicker */
  inkPicker?: boolean;
  /** nível padrão do fundo "ink" (1-7) — vem de home.inkLevel */
  inkLevel?: HomeInkLevel;
};

export function HomeContent({
  showHero = true,
  categoriesVariant = 'classic',
  showDiscover = false,
  inkPicker = HOME_INK_TONE_PICKER_ENABLED,
  inkLevel: defaultInkLevel = HOME_INK_FIXED_LEVEL,
}: HomeContentProps = {}) {
  const { messages } = useAppPreferences();
  const t = messages.home;

  const [inkLevel, setInkLevel] = useState<HomeInkLevel>(defaultInkLevel);

  useEffect(() => {
    if (!inkPicker) return;
    try {
      const saved = Number(localStorage.getItem(HOME_INK_STORAGE_KEY));
      if (HOME_INK_LEVELS.includes(saved as HomeInkLevel)) {
        queueMicrotask(() => setInkLevel(saved as HomeInkLevel));
      }
    } catch {
      // localStorage unavailable — keep the fixed default.
    }
  }, [inkPicker]);

  function handleInkLevelChange(level: HomeInkLevel) {
    setInkLevel(level);
    try {
      localStorage.setItem(HOME_INK_STORAGE_KEY, String(level));
    } catch {
      // ignore — the picker still works for this render, just won't persist.
    }
  }

  return (
    <main
      className="bg-background"
      data-home-ink-level={inkLevel}
      style={getHomeInkStyle(inkLevel)}
    >
      {showHero ? <HomeHero t={t} /> : null}
      <CategoryRail t={t} variant={categoriesVariant} />
      {showDiscover ? (
        <div className="pb-6">
          <DiscoverCta />
        </div>
      ) : null}
      <NearbyGrid t={t} />
      <HowItWorks t={t} />
      <JoinCta t={t} />
      {inkPicker ? (
        <HomeInkTonePicker level={inkLevel} onChange={handleInkLevelChange} />
      ) : null}
    </main>
  );
}
