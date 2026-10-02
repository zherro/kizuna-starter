// EXEMPLO — carrosséis "por categoria" da home (Server Component). Um por item de
// `home.categoryRails` no kizuna.config.json, na ordem do array. Reusa o carrossel do detalhe do
// anúncio (ServiceCarouselSection), então os cards já vêm com o estilo da categoria
// (`serviceDetail`: cinema sem preço, cor de acento...). Categoria inexistente/sem anúncio some.
import { loadCategoryRail } from '@kizuna/core/server';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import {
  ServiceCarouselSection,
  resolveCategoryHue,
  type ServiceDetailConfig,
} from '@kizuna/core/client/components/services/detail';

export type CategoryRailConfig = {
  /** slug da categoria (`categories.slug`) */
  slug: string;
  /** título da trilha; sem ele usa o nome da categoria */
  title?: string;
  /** máximo de cards (default 10); se vierem todos, a trilha termina com o card "Ver mais" */
  limit?: number;
};

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
    rails.map((rail) => loadCategoryRail(rail.slug, { ...rail, cityIbge: city?.ibge }))
  );
  const cityQuery = city
    ? `&state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
    : '';

  return (
    <>
      {loaded.map((data, index) => {
        if (!data) return null;
        const { category, items, hasMore } = data;
        return (
          <ServiceCarouselSection
            key={category.slug}
            title={rails[index].title ?? category.name}
            services={items}
            hue={resolveCategoryHue(category, detailConfig)}
            detailConfig={detailConfig}
            className="mx-auto w-full max-w-[1600px] px-4 pb-8 sm:px-6"
            moreHref={hasMore ? `/busca?categoryId=${category.id}${cityQuery}` : undefined}
            showCity={!city}
          />
        );
      })}
    </>
  );
}
