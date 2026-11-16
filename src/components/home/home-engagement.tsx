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
import { focusOnCity, seededShuffle } from '@/lib/city-focus';

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
  /** Container mais estreito (1280px) e peças mais espaçadas. Padrão false. */
  narrow?: boolean;
};

/** Nome da região da cidade (ex. "Grande Cuiabá"), a partir do título "Também na Grande Cuiabá". */
function regionName(city: RoutableCity): string | null {
  const r = regions.find((reg) => reg.cities.includes(String(city.ibge)));
  return r ? r.title.replace(/^também\s+(na|no|em)\s+/i, '').trim() || null : null;
}

/** Título honesto: só da cidade, cidade + região, ou só da região (cidade ainda sem lugares). */
function placesTitle(city: RoutableCity | null, own: number, sisters: number): string | undefined {
  if (!city || sisters === 0) return undefined; // padrão do core: "Lugares da cidade"
  if (own > 0) return `Lugares em ${city.name} e região`;
  const name = regionName(city);
  return name ? `Lugares na ${name}` : 'Lugares da região';
}

// Com `random`, busca mais lugares que o exibido e sorteia `limit` entre eles.
const placesPool = (limit: number, random: boolean) => (random ? Math.max(limit * 3, 12) : limit);

export async function HomePlaces({
  city,
  variant = 'auto',
  limit = 10,
  group,
  category,
  scope = 'region',
  random = true,
  narrow = false,
}: { city: RoutableCity | null } & PlacesMosaicConfig) {
  const target = category ? { slug: category } : group ? { group } : null;
  if (!target) {
    const items = loadHomePlaces({
      citySlug: city ? citySlug(city.name, city.state) : undefined,
      cityName: city?.name,
      limit: placesPool(limit, random),
    });
    return (
      <PlaceMosaic
        items={items}
        variant={variant}
        seed={mosaicDaySeed()}
        limit={limit}
        shuffle={random}
        narrow={narrow}
      />
    );
  }

  // Mesmo loader dos carrosséis: pool maior que `limit`.
  const region = city && scope === 'region';
  const data = await loadCategoryRail(target, {
    limit: placesPool(limit, random),
    cityIbge: city?.ibge,
    cityIbges: region ? regionCitiesFor(regions, city.ibge) : undefined,
  }).catch(() => null);
  if (!data) return null;
  const filter = data.kind === 'group' ? `group=${data.category.slug}` : `categoryId=${data.category.id}`;
  const cityQuery = city
    ? `&state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
    : '';

  // Cidades irmãs: a cidade da página tem preferência (1º lugar, o destaque, é dela) e as irmãs têm
  // ~30% garantidos (city-focus). Com `random`, o sorteio é do dia (o mesmo para todos no dia) e
  // feito aqui — no navegador ele desfaria o foco.
  const day = mosaicDaySeed();
  const pool = random ? seededShuffle(data.items, `${day}:${city?.ibge ?? ''}`) : data.items;
  const focused = focusOnCity(pool, { cityName: region ? city.name : null, limit, arrange: 'city' });
  return (
    <PlaceMosaic
      items={placeItemsFromServices(focused.items)}
      title={placesTitle(region ? city : null, focused.ownCount, focused.sisterCount)}
      variant={variant}
      seed={day}
      limit={limit}
      narrow={narrow}
      moreHref={`/busca?${filter}${cityQuery}`}
    />
  );
}

export async function HomeNews({
  city,
  leads = 1,
  listLimit = 5,
  narrow = false,
}: {
  city: RoutableCity | null;
  /** Manchetes em destaque (1, 2 ou 4) — vem de home.newsLeads. */
  leads?: 1 | 2 | 4;
  listLimit?: number;
  /** Container mais estreito (1280px) e mais respiro — vem de home.newsNarrow. */
  narrow?: boolean;
}) {
  // Falha de rede/RPC não pode derrubar a home inteira: o bloco apenas some.
  const items = await loadHomeNews({
    cityIbge: city?.ibge,
    cityName: city?.name,
    limit: leads + listLimit,
  }).catch(() => []);
  return (
    <NewsHighlights items={items} moreHref={homeNewsMoreHref(city)} leadCount={leads} listLimit={listLimit} narrow={narrow} />
  );
}
