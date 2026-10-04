// EXEMPLO — carrosséis "por categoria" da home (Server Component). Um por item de
// `home.categoryRails` no kizuna.config.json, na ordem do array — por categoria (`slug`) ou por
// grupo de categoria (`group`). Mesma RPC da busca (só anúncios ativos e não expirados). A ordem
// é embaralhada a cada visita no navegador (ShuffledServiceCarouselSection), já que a home é ISR.
// Reusa o carrossel do detalhe do
// anúncio (ServiceCarouselSection), então os cards já vêm com o estilo da categoria
// (`serviceDetail`: cinema sem preço, cor de acento...). Categoria inexistente/sem anúncio some.
import { loadCategoryRail } from '@kizuna/core/server';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { parseRegions, regionCitiesFor } from '@kizuna/core/shared/regions';
import cfg from '@/../kizuna.config.json';
import {
  ShuffledServiceCarouselSection,
  resolveCategoryHue,
  type ServiceDetailConfig,
} from '@kizuna/core/client/components/services/detail';

export type CategoryRailConfig = {
  /** slug da categoria (`categories.slug`) — use este OU `group` */
  slug?: string;
  /** slug do grupo de categoria (`categories_group.slug`) — use este OU `slug` */
  group?: string;
  /** título da trilha; sem ele usa o nome da categoria */
  title?: string;
  /** máximo de cards (default 10); se vierem todos, a trilha termina com o card "Ver mais" */
  limit?: number;
  /** "city" (padrão): só a cidade da página; "region": a cidade + vizinhas da região (`regions`). */
  scope?: 'city' | 'region';
};

const regions = parseRegions((cfg as { regions?: unknown }).regions);

export async function CategoryRails({
  rails,
  detailConfig,
  city,
}: {
  rails: CategoryRailConfig[];
  detailConfig?: ServiceDetailConfig | null;
  /** Home de uma cidade: filtra as trilhas por ela e esconde a cidade nos cards. */
  city?: RoutableCity | null;
}) {
  const loaded = await Promise.all(
    rails.map((rail) => loadCategoryRail(
        rail.group ? { group: rail.group } : { slug: rail.slug ?? '' },
        {
          limit: rail.limit,
          cityIbge: city?.ibge,
          cityIbges: city && rail.scope === 'region' ? regionCitiesFor(regions, city.ibge) : undefined,
        }
      ))
  );
  const cityQuery = city
    ? `&state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
    : '';

  return (
    <>
      {loaded.map((data, index) => {
        if (!data) return null;
        const { kind, category, items, limit, hasMore } = data;
        const searchFilter =
          kind === 'group' ? `group=${category.slug}` : `categoryId=${category.id}`;
        return (
          <ShuffledServiceCarouselSection
            key={`${kind}:${category.slug}`}
            title={rails[index].title ?? category.name}
            services={items}
            limit={limit}
            hue={resolveCategoryHue(category, detailConfig)}
            detailConfig={detailConfig}
            className="mx-auto w-full max-w-[1600px] px-4 pb-8 sm:px-6"
            moreHref={hasMore ? `/busca?${searchFilter}${cityQuery}` : undefined}
            showCity={!city || rails[index].scope === 'region'}
          />
        );
      })}
    </>
  );
}
