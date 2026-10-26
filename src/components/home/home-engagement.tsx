// Blocos de engajamento da home (Server Components): "Notícias" e "Lugares da cidade". Só compõem
// os blocos do core com os loaders; cada um some sozinho quando não há conteúdo.
import { PlaceMosaic } from '@kizuna/core/client/components/home/place-mosaic';
import {
  mosaicDaySeed,
  type PlaceMosaicVariantProp,
} from '@kizuna/core/client/components/home/place-mosaic-layout';
import { placeItemsFromServices } from '@kizuna/core/client/components/home/place-mosaic-services';
import { NewsHighlights } from '@kizuna/core/client/components/home/news-highlights';
import { loadCategoryRail } from '@kizuna/core/server';
import { citySlug, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { parseRegions, regionCitiesFor } from '@kizuna/core/shared/regions';
import cfg from '@/../kizuna.config.json';
import { loadHomePlaces } from '@/lib/lugares';
import { homeNewsMoreHref, loadHomeNews } from '@/lib/noticias';

const regions = parseRegions((cfg as { regions?: unknown }).regions);

export type PlacesMosaicConfig = {
  /** "bento" | "columns" | "strips" | "auto" (muda a cada dia) — vem de home.placesMosaic.variant */
  variant?: PlaceMosaicVariantProp;
  /** máximo de lugares no mosaico — vem de home.placesMosaic.limit */
  limit?: number;
  /** Lugares do Kizuna por grupo de categoria (`categories_group.slug`, ex. "lugares")… */
  group?: string;
  /** …ou por categoria (`categories.slug`, ex. "compras"); tem precedência sobre `group`. Sem os
   * dois, o mosaico lê os artigos de content/lugares (só os aprovados). */
  category?: string;
  /** "city": só a cidade da página; "region" (padrão): a cidade + vizinhas da região (`regions`). */
  scope?: 'city' | 'region';
  /** Ordem aleatória a cada visita (embaralha no navegador). Padrão true. */
  random?: boolean;
};

export async function HomePlaces({
  city,
  variant = 'auto',
  limit = 10,
  group,
  category,
  scope = 'region',
  random = true,
}: { city: RoutableCity | null } & PlacesMosaicConfig) {
  const target = category ? { slug: category } : group ? { group } : null;
  if (!target) {
    const items = loadHomePlaces({
      citySlug: city ? citySlug(city.name, city.state) : undefined,
      cityName: city?.name,
      limit,
    });
    return <PlaceMosaic items={items} variant={variant} seed={mosaicDaySeed()} limit={limit} shuffle={random} />;
  }

  // Mesmo loader dos carrosséis: pool maior que `limit` (o navegador sorteia e corta).
  const data = await loadCategoryRail(target, {
    limit,
    cityIbge: city?.ibge,
    cityIbges: city && scope === 'region' ? regionCitiesFor(regions, city.ibge) : undefined,
  }).catch(() => null);
  if (!data) return null;
  const filter = data.kind === 'group' ? `group=${data.category.slug}` : `categoryId=${data.category.id}`;
  const cityQuery = city
    ? `&state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
    : '';
  return (
    <PlaceMosaic
      items={placeItemsFromServices(data.items)}
      variant={variant}
      seed={mosaicDaySeed()}
      limit={limit}
      shuffle={random}
      moreHref={`/busca?${filter}${cityQuery}`}
    />
  );
}

export async function HomeNews({
  city,
  leads = 1,
  listLimit = 5,
}: {
  city: RoutableCity | null;
  /** Manchetes em destaque (1 ou 2) — vem de home.newsLeads. */
  leads?: 1 | 2;
  listLimit?: number;
}) {
  // Falha de rede/RPC não pode derrubar a home inteira: o bloco apenas some.
  const items = await loadHomeNews({ cityIbge: city?.ibge, limit: leads + listLimit }).catch(() => []);
  return (
    <NewsHighlights items={items} moreHref={homeNewsMoreHref(city)} leadCount={leads} listLimit={listLimit} />
  );
}
