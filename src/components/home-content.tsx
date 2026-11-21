// Corpo da home — Server Component. Só as ilhas interativas são client: carrossel de categorias
// (`CategoryRail`, cards já buscados no servidor), textos que seguem o idioma do usuário
// (`home-i18n.tsx`), vagas de anúncio (`AdSlot`), chamadas/busca montadas na page e o seletor do
// fundo "ink" (`HomeInkShell`, só com `inkPicker`). Trilhas, notícias, lugares e SEO chegam como
// Server Components prontos.
//
// Ordem pensada para o celular (360×740, 90% do público): a 1ª dobra é busca → atalhos numa linha →
// 1ª trilha (eventos). Carrossel de categorias, demais trilhas e notícias vêm depois.
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
  /** 1ª trilha (a de eventos), logo abaixo da busca e dos atalhos: entra na 1ª dobra do celular */
  leadRail?: ReactNode;
  /** demais carrosséis por categoria (Server Components montados na page), depois das categorias — vem de home.categoryRails */
  categoryRails?: ReactNode;
  /** atalhos numa linha só (Hoje, Mapa, Descobrir) — a versão de celular das chamadas abaixo */
  shortcuts?: ReactNode;
  /** chamada "O que tem pra hoje" (Server Component montado na page), logo abaixo do swipe */
  todayCallout?: ReactNode;
  /** chamada "Mapa: o que tem perto de você" (Server Component montado na page), logo abaixo da do Hoje */
  mapCallout?: ReactNode;
  /** busca no topo da home, logo abaixo do cabeçalho (Client Component montado na page) — vem de home.showSearch */
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
  leadRail,
  categoryRails,
  shortcuts,
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
  const hasCallouts = showDiscover || todayCallout || mapCallout;
  const content = (
    <>
      {showHero ? <HomeHeroI18n /> : null}
      {/* busca compacta no topo (~60px no celular), centralizada (~700px) no desktop */}
      {searchBar ? (
        <div className="mx-auto w-full max-w-[calc(700px+2rem)] px-4 pb-3 pt-3 sm:max-w-[calc(700px+3rem)] sm:px-6 sm:pb-4 sm:pt-8">
          {searchBar}
        </div>
      ) : null}
      {/* Atalhos: celular = uma linha compacta; a partir de sm = os cartões (desktop: 3 colunas). */}
      {shortcuts ? <div className="px-4 pb-5 sm:hidden">{shortcuts}</div> : null}
      {hasCallouts ? (
        <div
          className={`mx-auto w-full max-w-[1600px] grid-cols-2 gap-3 px-4 pb-6 pt-1 sm:gap-4 sm:px-6 sm:pb-12 sm:pt-4 lg:grid-cols-3 ${shortcuts ? 'hidden sm:grid' : 'grid'}`}
        >
          {showDiscover ? (
            <div className="order-3 lg:order-1">
              <DiscoverCta contained={false} />
            </div>
          ) : null}
          {todayCallout ? <div className="order-1 col-span-2 lg:order-2 lg:col-span-1">{todayCallout}</div> : null}
          {mapCallout ? <div className="order-2 lg:order-3">{mapCallout}</div> : null}
        </div>
      ) : null}
      {leadRail}
      <AdSlot slot="home-destaque" city={cityName} adsenseClient={adsConfig.adsenseClient} maxPerPage={adsConfig.maxSlotsPerPage} paidShare={adsConfig.paidShare} />
      <HomeCategoryRail variant={categoriesVariant} onlyWithListings={categoriesOnlyWithListings} />
      {/* o carrossel de categorias não tem respiro embaixo: as trilhas seguintes também não têm em cima */}
      {categoryRails ? <div className="pt-10 sm:pt-12">{categoryRails}</div> : null}
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
