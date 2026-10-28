'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { DiscoverCta } from '@kizuna/core/client/components/home/discover-cta';
import { HomeHero } from './home/home-hero';
import { CategoryRail } from './home/category-rail';
import { NearbyGrid } from './home/nearby-grid';
import { HowItWorks } from './home/how-it-works';
import { SocialInstallCards } from './home/social-install-cards';
import {
  getHomeInkStyle,
  HOME_INK_FIXED_LEVEL,
  HOME_INK_LEVELS,
  HOME_INK_STORAGE_KEY,
  HOME_INK_TONE_PICKER_ENABLED,
  type HomeInkLevel,
} from './home/home-ink-config';
import { HomeInkTonePicker } from './home/home-ink-tone-picker';
import { AdSlot } from '@kizuna/core/client/ads';
import { adsConfig } from '@/lib/ads';

type HomeContentProps = {
  /** mostra a seção hero (default true) — vem de home.showHero no kizuna.config.json */
  showHero?: boolean;
  /** layout do carrossel de categorias — vem de home.categoriesVariant */
  categoriesVariant?: 'classic' | 'compact';
  /** só categorias com anúncio publicado — vem de home.categoriesOnlyWithListings */
  categoriesOnlyWithListings?: boolean;
  /** mostra o banner "Descobrir no swipe" — vem de home.showDiscover */
  showDiscover?: boolean;
  /** mostra o seletor de intensidade do fundo "ink" — vem de home.inkPicker */
  inkPicker?: boolean;
  /** nível padrão do fundo "ink" (1-7) — vem de home.inkLevel */
  inkLevel?: HomeInkLevel;
  /** carrosséis por categoria (Server Components montados na page) — vem de home.categoryRails */
  categoryRails?: ReactNode;
  /** chamada "O que tem pra hoje" (Server Component montado na page), logo abaixo do swipe */
  todayCallout?: ReactNode;
  /** chamada "Mapa: o que tem perto de você" (Server Component montado na page), logo abaixo da do Hoje */
  mapCallout?: ReactNode;
  /** busca logo abaixo do swipe (Client Component montado na page) — vem de home.showSearch */
  searchBar?: ReactNode;
  /** blocos de engajamento (Server Components montados na page): notícias e, abaixo, lugares da cidade — vêm de home.showNews / home.showPlaces */
  placeHighlights?: ReactNode;
  newsHighlights?: ReactNode;
  /** bloco de SEO (h1, texto indexável, JSON-LD) — Server Component montado na page */
  seoContent?: ReactNode;
  /** URL do perfil no Instagram — vem de home.instagramUrl (sem ela o card do Instagram não aparece) */
  instagramUrl?: string;
  /** mostra "Quem está por perto" (amostra de profissionais de exemplo) — vem de home.showNearby */
  showNearby?: boolean;
  /** nome da cidade da home (segmenta os anúncios por cidade) — vazio na home global */
  cityName?: string;
};

export function HomeContent({
  showHero = true,
  categoriesVariant = 'classic',
  categoriesOnlyWithListings = false,
  showDiscover = false,
  inkPicker = HOME_INK_TONE_PICKER_ENABLED,
  inkLevel: defaultInkLevel = HOME_INK_FIXED_LEVEL,
  categoryRails,
  todayCallout,
  mapCallout,
  searchBar,
  placeHighlights,
  newsHighlights,
  seoContent,
  instagramUrl,
  showNearby = true,
  cityName,
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
      <AdSlot slot="home-destaque" city={cityName} adsenseClient={adsConfig.adsenseClient} maxPerPage={adsConfig.maxSlotsPerPage} />
      <CategoryRail
        t={t}
        variant={categoriesVariant}
        onlyWithListings={categoriesOnlyWithListings}
      />
      {/* Chamadas: celular = "hoje" em linha cheia e, abaixo, mapa e swipe lado a lado; desktop = 3 colunas. */}
      {showDiscover || todayCallout || mapCallout ? (
        <div className="mx-auto grid w-full max-w-[1600px] grid-cols-2 gap-3 px-4 pb-10 pt-6 sm:gap-4 sm:px-6 sm:pb-12 sm:pt-8 lg:grid-cols-3">
          {showDiscover ? (
            <div className="order-3 lg:order-1">
              <DiscoverCta contained={false} />
            </div>
          ) : null}
          {todayCallout ? <div className="order-1 col-span-2 lg:order-2 lg:col-span-1">{todayCallout}</div> : null}
          {mapCallout ? <div className="order-2 lg:order-3">{mapCallout}</div> : null}
        </div>
      ) : null}
      {/* busca centralizada (~700px) e com respiro: é o convite principal depois do swipe */}
      {searchBar ? (
        <div className="mx-auto w-full max-w-[calc(700px+2rem)] px-4 pb-14 pt-6 sm:max-w-[calc(700px+3rem)] sm:px-6 sm:pb-16 sm:pt-8">
          {searchBar}
        </div>
      ) : null}
      {categoryRails}
      <AdSlot slot="home-meio" city={cityName} adsenseClient={adsConfig.adsenseClient} maxPerPage={adsConfig.maxSlotsPerPage} />
      {newsHighlights}
      {seoContent}
      {placeHighlights}
      {showNearby ? <NearbyGrid t={t} /> : null}
      <HowItWorks t={t} />
      <SocialInstallCards t={t} instagramUrl={instagramUrl} />
      {inkPicker ? (
        <HomeInkTonePicker level={inkLevel} onChange={handleInkLevelChange} />
      ) : null}
    </main>
  );
}
