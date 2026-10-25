// Blocos de engajamento da home (Server Components): "Lugares da cidade" e "Notícias". Só compõem
// os blocos do core com os loaders do starter; cada um some sozinho quando não há conteúdo.
import { PlaceMosaic } from '@kizuna/core/client/components/home/place-mosaic';
import {
  mosaicDaySeed,
  type PlaceMosaicVariantProp,
} from '@kizuna/core/client/components/home/place-mosaic-layout';
import { NewsHighlights } from '@kizuna/core/client/components/home/news-highlights';
import { citySlug, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { loadHomePlaces } from '@/lib/lugares';
import { homeNewsMoreHref, loadHomeNews } from '@/lib/noticias';

export type PlacesMosaicConfig = {
  /** "bento" | "columns" | "strips" | "auto" (muda a cada dia) — vem de home.placesMosaic.variant */
  variant?: PlaceMosaicVariantProp;
  /** máximo de lugares no mosaico — vem de home.placesMosaic.limit */
  limit?: number;
};

export function HomePlaces({
  city,
  variant = 'auto',
  limit = 10,
}: { city: RoutableCity | null } & PlacesMosaicConfig) {
  const items = loadHomePlaces({
    citySlug: city ? citySlug(city.name, city.state) : undefined,
    cityName: city?.name,
    limit,
  });
  return <PlaceMosaic items={items} variant={variant} seed={mosaicDaySeed()} />;
}

export async function HomeNews({ city, limit = 6 }: { city: RoutableCity | null; limit?: number }) {
  // Falha de rede/RPC não pode derrubar a home inteira: o bloco apenas some.
  const items = await loadHomeNews({ cityIbge: city?.ibge, limit }).catch(() => []);
  return <NewsHighlights items={items} moreHref={homeNewsMoreHref(city)} />;
}
