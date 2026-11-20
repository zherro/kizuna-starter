// Corpo da home — Server Component. Só as ilhas interativas são client: carrossel de categorias
// (`CategoryRail`, cards já buscados no servidor), textos que seguem o idioma do usuário
// (`home-i18n.tsx`), vagas de anúncio (`AdSlot`), chamadas/busca montadas na page e o seletor do
// fundo "ink" (`HomeInkShell`, só com `inkPicker`). Trilhas, notícias, lugares e SEO chegam como
// Server Components prontos.
import type { ReactNode } from 'react';
import { DiscoverCta } from '@kizuna/core/client/components/home/discover-cta';
import { HomeCategoryRail } from './home/home-category-rail';
import { AnuncieLinks } from './home/anuncie-links';
import {
  HomeHeroI18n,
  HowItWorksI18n,
  NearbyGridI18n,
  SocialInstallCardsI18n,
} from './home/home-i18n';
import {
  getHomeInkStyle,
  HOME_INK_FIXED_LEVEL,
  HOME_INK_TONE_PICKER_ENABLED,
  type HomeInkLevel,
} from './home/home-ink-config';
import { HomeInkShell } from './home/home-ink-shell';
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
  const content = (
    <>
      {showHero ? <HomeHeroI18n /> : null}
      <AdSlot slot="home-destaque" city={cityName} adsenseClient={adsConfig.adsenseClient} maxPerPage={adsConfig.maxSlotsPerPage} paidShare={adsConfig.paidShare} />
      <HomeCategoryRail variant={categoriesVariant} onlyWithListings={categoriesOnlyWithListings} />
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
      <AdSlot slot="home-meio" city={cityName} adsenseClient={adsConfig.adsenseClient} maxPerPage={adsConfig.maxSlotsPerPage} paidShare={adsConfig.paidShare} />
      {newsHighlights}
      {seoContent}
      {placeHighlights}
      {showNearby ? <NearbyGridI18n /> : null}
      <HowItWorksI18n />
      <AnuncieLinks />
      <SocialInstallCardsI18n instagramUrl={instagramUrl} />
    </>
  );

  // Com o seletor, o nível salvo no navegador manda — o `<main>` vira ilha client (conteúdo segue do servidor).
  if (inkPicker) {
    return (
      <HomeInkShell className="bg-background" defaultLevel={defaultInkLevel}>
        {content}
      </HomeInkShell>
    );
  }

  return (
    <main className="bg-background" data-home-ink-level={defaultInkLevel} style={getHomeInkStyle(defaultInkLevel)}>
      {content}
    </main>
  );
}
