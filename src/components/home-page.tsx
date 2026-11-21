// EXEMPLO — corpo da home pública, global (`/`) ou de uma cidade (`/[cidade]`). A cara é
// parametrizada por `kizuna.config.json` (chave "home"), não por env — evita rebuild de Docker
// com --build-arg para cada toggle novo.
import { HomeContent } from '@/components/home-content';
import cfg from '@/../kizuna.config.json';
import { HOME_INK_LEVELS, type HomeInkLevel } from '@/components/home/home-ink-config';
import { CategoryRails, type CategoryRailConfig } from '@/components/home/category-rails';
import { HomeNews, HomePlaces, type PlacesMosaicConfig } from '@/components/home/home-engagement';
import { HomeSeo } from '@/components/home/home-seo';
import { TodayCallout } from '@kizuna/core/client/components/today';
import { MapCallout } from '@kizuna/core/client/components/map';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { HomeSearch } from '@kizuna/core/client/components/home/home-search';
import { HomeShortcuts } from '@kizuna/core/client/components/home/home-shortcuts';
import { Flame, MapPin, Sun } from 'lucide-react';
import type { ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';

const home = cfg.home as typeof cfg.home & {
  inkPicker?: boolean;
  inkLevel?: number;
  categoriesOnlyWithListings?: boolean;
  categoryRails?: CategoryRailConfig[];
  instagramUrl?: string;
  showNearby?: boolean;
  showPlaces?: boolean;
  showNews?: boolean;
  newsLimit?: number;
  showSearch?: boolean;
  placesMosaic?: PlacesMosaicConfig;
};
// `search.ai` desliga o assistente também na busca da home (mesmo critério da /busca).
const aiEnabled = (cfg as { search?: { ai?: boolean } }).search?.ai !== false;
const categoryRails = ((home?.categoryRails ?? []) as CategoryRailConfig[]).filter((rail) => rail?.slug || rail?.group);
const serviceDetailConfig = (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;
const inkLevel = HOME_INK_LEVELS.includes(home?.inkLevel as HomeInkLevel)
  ? (home.inkLevel as HomeInkLevel)
  : undefined;

export function HomePage({ city }: { city: RoutableCity | null }) {
  const todayHref = city ? cityPath(city, '/hoje') : '/hoje';
  // 1ª trilha (eventos) entra na 1ª dobra do celular, logo abaixo da busca e dos atalhos; as demais
  // vêm depois do carrossel de categorias. O 1º card dela leva a imagem prioritária (LCP).
  const [firstRail, ...otherRails] = categoryRails;
  return (
    <HomeContent
      showHero={cfg.home?.showHero !== false}
      categoriesVariant={cfg.home?.categoriesVariant === 'compact' ? 'compact' : 'classic'}
      categoriesOnlyWithListings={home?.categoriesOnlyWithListings === true}
      showDiscover={cfg.home?.showDiscover === true}
      inkPicker={home?.inkPicker !== false}
      inkLevel={inkLevel}
      instagramUrl={home?.instagramUrl || undefined}
      showNearby={home?.showNearby !== false}
      cityName={city?.name}
      todayCallout={<TodayCallout contained={false} href={todayHref} />}
      mapCallout={<MapCallout contained={false} href="/mapa" />}
      shortcuts={
        <HomeShortcuts
          items={[
            { href: todayHref, label: 'Hoje', icon: <Sun />, featured: true },
            { href: '/mapa', label: 'Mapa', icon: <MapPin /> },
            ...(cfg.home?.showDiscover === true ? [{ href: '/descobrir', label: 'Descobrir', icon: <Flame /> }] : []),
          ]}
        />
      }
      searchBar={
        home?.showSearch !== false ? (
          <HomeSearch
            city={city ? { name: city.name, state: city.state, ibge: String(city.ibge) } : null}
            aiEnabled={aiEnabled}
            contained={false}
            className="p-1 shadow-sm sm:p-1.5 sm:shadow-md"
          />
        ) : null
      }
      placeHighlights={
        home?.showPlaces !== false ? <HomePlaces city={city} {...home?.placesMosaic} /> : null
      }
      newsHighlights={
        home?.showNews !== false ? (
          <HomeNews city={city} limit={home?.newsLimit && home.newsLimit > 0 ? home.newsLimit : 4} />
        ) : null
      }
      seoContent={<HomeSeo city={city} showHero={cfg.home?.showHero !== false} />}
      leadRail={
        firstRail ? (
          <CategoryRails rails={[firstRail]} detailConfig={serviceDetailConfig} city={city} priorityFirst />
        ) : null
      }
      categoryRails={
        otherRails.length > 0 ? (
          <CategoryRails rails={otherRails} detailConfig={serviceDetailConfig} city={city} />
        ) : null
      }
    />
  );
}
