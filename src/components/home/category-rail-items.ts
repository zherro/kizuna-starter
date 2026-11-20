// Cards do carrossel "O que você quer fazer hoje?" montados no SERVIDOR (antes eram 4 fetches no
// navegador depois da hidratação, com esqueleto no lugar). Mesmos recursos públicos e mesma regra do
// <CategoryCarousel> do core (`buildCategoryItems`/`buildGroupItems`), lidos com o cache público de
// 5 min dos recursos (`publicCacheSeconds: 300`); a página ainda é ISR (`revalidate` da rota).
// Falhou a taxonomia? Devolve `undefined` e o carrossel volta a buscar no cliente, como antes.
import { serverFetchResource } from '@kizuna/core/server/postgrest-crud';
import {
  buildCategoryItems,
  buildGroupItems,
  type CategoryCarouselFacetRow,
  type CategoryCarouselGroupRow,
  type CategoryCarouselItem,
  type CategoryCarouselListingRow,
  type CategoryCarouselStatRow,
} from '@kizuna/core/client/components/taxonomy/category-carousel-items';

const CACHE_SECONDS = 300;
/** Mesmo teto que o carrossel pede no cliente (uma linha por subcategoria). */
const MAX_ROWS = 1000;

type Fetch = <T>(resource: string) => Promise<T[]>;

const fetchPublic: Fetch = <T,>(resource: string) =>
  serverFetchResource<T>(resource, {}, { auth: null, limit: MAX_ROWS, revalidate: CACHE_SECONDS });

export async function loadCategoryRailItems(
  { groupBy, onlyWithListings }: { groupBy: 'category' | 'group'; onlyWithListings: boolean },
  fetchRows: Fetch = fetchPublic
): Promise<CategoryCarouselItem[] | undefined> {
  const byGroup = groupBy === 'group';
  const [stats, listings, groups, facets] = await Promise.allSettled([
    fetchRows<CategoryCarouselStatRow>('category_stats'),
    onlyWithListings ? fetchRows<CategoryCarouselListingRow>('category_service_stats') : Promise.resolve([]),
    byGroup ? fetchRows<CategoryCarouselGroupRow>('categories_group_public') : Promise.resolve([]),
    byGroup && onlyWithListings
      ? fetchRows<CategoryCarouselFacetRow>('category_service_facets')
      : Promise.resolve([]),
  ]);
  // Sem a taxonomia (ou sem os dados de que o modo escolhido depende) não dá para montar: o cliente busca.
  if (stats.status === 'rejected') return undefined;
  if (listings.status === 'rejected' || groups.status === 'rejected') return undefined;

  const categoryItems = buildCategoryItems(stats.value, listings.value, onlyWithListings);
  if (!byGroup) return categoryItems;
  return buildGroupItems({
    stats: stats.value,
    groups: groups.value,
    facets: facets.status === 'fulfilled' ? facets.value : [],
    // igual ao cliente: sem as facetas (migração 0013 ausente) cai no grupo primário
    facetsError: facets.status === 'rejected',
    onlyWithListings,
    categoryItems,
  });
}
