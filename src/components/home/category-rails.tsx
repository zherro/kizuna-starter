// EXEMPLO — carrosséis "por categoria" da home (Server Component). Um por item de
// `home.categoryRails` no kizuna.config.json, na ordem do array — por categoria (`slug`) ou por
// grupo de categoria (`group`). Mesma RPC da busca (só anúncios ativos e não expirados).
//
// Cidades irmãs (`regions`, scope "region"): a trilha busca a região, mas quem aparece é decidido
// por `focusOnCity` — a cidade da página tem preferência e as irmãs têm ~30% dos cards garantidos
// quando têm conteúdo (ver src/lib/city-focus.ts). Trilha sem `order` é sorteada a cada visita no
// navegador (a home é ISR); com `order` (ex. eventos por data) a ordem é fixa.
// Reusa o carrossel do detalhe do anúncio (ServiceCarouselSection), então os cards já vêm com o
// estilo da categoria (`serviceDetail`: cinema sem preço, cor de acento...). Categoria
// inexistente/sem anúncio some.
import { loadCategoryRail } from '@kizuna/core/server';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { parseRegions, regionCitiesFor } from '@kizuna/core/shared/regions';
import cfg from '@/../kizuna.config.json';
import { trackRule } from '@/lib/analytics';
import { AdSlot } from '@kizuna/core/client/ads';
import { adsConfig } from '@/lib/ads';
import { loadOrderedRail } from '@/lib/server/ordered-rail';
import { FocusedServiceRail } from '@/components/home/focused-service-rail';
import { resolveCategoryHue, type ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';

export type CategoryRailConfig = {
  /** slug da categoria (`categories.slug`) — use este OU `group` */
  slug?: string;
  /** slug do grupo de categoria (`categories_group.slug`) — use este OU `slug` */
  group?: string;
  /** título da trilha; sem ele usa o nome da categoria */
  title?: string;
  /** máximo de cards (default 10); a trilha termina com o card "Ver mais" */
  limit?: number;
  /** "city" (padrão): só a cidade da página; "region": a cidade + vizinhas da região (`regions`). */
  scope?: 'city' | 'region';
  /**
   * Ordem fixa em vez do sorteio (ex.: "event_start" = próximos eventos primeiro, pela data do
   * evento). Aceita o mesmo formato de `search.orderByGroup` ("campo:asc|desc").
   */
  order?: string;
  /** Um card por título, o da cidade da página (ex.: cinema — o mesmo filme é um anúncio por cidade). */
  dedupeTitle?: boolean;
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
    rails.map((rail) => {
      const target = rail.group ? { group: rail.group } : { slug: rail.slug ?? '' };
      const options = {
        limit: rail.limit,
        cityIbge: city?.ibge,
        cityIbges: city && rail.scope === 'region' ? regionCitiesFor(regions, city.ibge) : undefined,
      };
      const order = rail.order?.trim();
      return order ? loadOrderedRail(target, order, options) : loadCategoryRail(target, options);
    })
  );
  const cityQuery = city
    ? `&state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
    : '';

  return (
    <>
      {loaded.map((data, index) => {
        if (!data) return null;
        const rail = rails[index];
        const { kind, category, items, limit } = data;
        const searchFilter =
          kind === 'group' ? `group=${category.slug}` : `categoryId=${category.id}`;
        const ordered = Boolean(rail.order?.trim());
        return (
          <FocusedServiceRail
            key={`${kind}:${category.slug}`}
            pool={items}
            shuffle={!ordered}
            focus={{
              // foco só faz sentido quando a trilha junta a região
              cityName: rail.scope === 'region' ? city?.name : null,
              limit,
              dedupeTitle: rail.dedupeTitle === true,
              // sempre a cidade da página na frente; com `order`, cada lado segue a ordem (data)
              arrange: 'city',
            }}
            title={rail.title ?? category.name}
            hue={resolveCategoryHue(
              kind === 'group' ? { groupSlug: category.slug } : { slug: category.slug },
              detailConfig
            )}
            detailConfig={detailConfig}
            className="mx-auto w-full max-w-[1600px] px-4 pb-14 sm:px-6 sm:pb-16"
            // sempre: mesmo com poucos itens a busca traz filtros e datas que a trilha não tem
            moreHref={`/busca?${searchFilter}${cityQuery}`}
            showCity={!city || rail.scope === 'region'}
            impressionRule={trackRule('service', 'impression')}
            source="home"
            adSlot={
              <AdSlot
                slot="trilho-card"
                inline
                city={city?.name}
                adsenseClient={adsConfig.adsenseClient}
                maxPerPage={adsConfig.maxSlotsPerPage}
              />
            }
          />
        );
      })}
    </>
  );
}
