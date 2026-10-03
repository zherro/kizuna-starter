// EXEMPLO — corpo da home pública, global (`/`) ou de uma cidade (`/[cidade]`). A cara é
// parametrizada por `kizuna.config.json` (chave "home"), não por env — evita rebuild de Docker
// com --build-arg para cada toggle novo.
import { HomeContent } from '@/components/home-content';
import cfg from '@/../kizuna.config.json';
import { HOME_INK_LEVELS, type HomeInkLevel } from '@/components/home/home-ink-config';
import type { HomeSlide } from '@/components/home/home-slider';
import { CategoryRails, type CategoryRailConfig } from '@/components/home/category-rails';
import type { ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';

const home = cfg.home as typeof cfg.home & {
  inkPicker?: boolean;
  inkLevel?: number;
  categoriesOnlyWithListings?: boolean;
  categoryRails?: CategoryRailConfig[];
  instagramUrl?: string;
  slider?: { enabled?: boolean; autoplayMs?: number; slides?: HomeSlide[] };
};
const slider = home?.slider;
const sliderSlides = slider?.enabled === false ? [] : (slider?.slides ?? []);
const categoryRails = (home?.categoryRails ?? []).filter((rail) => rail?.slug);
const serviceDetailConfig = (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;
const inkLevel = HOME_INK_LEVELS.includes(home?.inkLevel as HomeInkLevel)
  ? (home.inkLevel as HomeInkLevel)
  : undefined;

export function HomePage({ city }: { city: RoutableCity | null }) {
  return (
    <HomeContent
      showHero={cfg.home?.showHero !== false}
      categoriesVariant={cfg.home?.categoriesVariant === 'compact' ? 'compact' : 'classic'}
      categoriesOnlyWithListings={home?.categoriesOnlyWithListings === true}
      showDiscover={cfg.home?.showDiscover === true}
      sliderSlides={sliderSlides}
      sliderAutoplayMs={slider?.autoplayMs}
      inkPicker={home?.inkPicker !== false}
      inkLevel={inkLevel}
      instagramUrl={home?.instagramUrl || undefined}
      categoryRails={
        categoryRails.length > 0 ? (
          <CategoryRails rails={categoryRails} detailConfig={serviceDetailConfig} city={city} />
        ) : null
      }
    />
  );
}
