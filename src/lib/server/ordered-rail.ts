// Trilha da home em ORDEM (ex.: eventos por data), sem o embaralhamento do `loadCategoryRail` do
// core. Mesma RPC pública da busca (`fn_search_services`: só ativos e não vencidos), com `p_order`
// e semente fixa — a lista é estável entre visitas e entre gerações de ISR.
// Paliativo do projeto até o core ganhar uma opção de ordem nas trilhas (`home.categoryRails`).
import { unstable_cache } from 'next/cache';
import { serverFetchResource } from '@kizuna/core/server/postgrest-crud';
import { runServiceSearch, seedFromKey } from '@kizuna/core/server/services/service-search';
import { eventDay } from '@kizuna/core/server/services/today-feed-data';
import { projectBoostPlacement } from '@kizuna/core/server/marketing/boost-config';
import { pinSponsored, sponsoredMaxParam } from '@kizuna/core/shared/marketing/boost-placement';
import type { CategoryRailData } from '@kizuna/core/server';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';

const DEFAULT_LIMIT = 10;
const CACHE_SECONDS = 300;
/** Pool = `limit` × isto, para o foco na cidade ter de onde escolher (igual ao core). */
const POOL_FACTOR = 3;
/** `marketing.boost.railPool`: candidatos patrocinados por trilha (undefined = desligado). */
const SPONSORED_POOL = sponsoredMaxParam(projectBoostPlacement, projectBoostPlacement.railPool);

type TaxonomyRow = { id: number | string; name: string; slug: string };

/** Do dia mais cedo ao mais tarde (início do evento); sem data vai para o fim. Não muta a entrada. */
export function sortByEventDay(items: readonly ServiceResult[]): ServiceResult[] {
  return items
    .map((s, i) => ({ s, i, d: eventDay(s) }))
    .sort(
      (a, b) =>
        (a.d === null ? 1 : 0) - (b.d === null ? 1 : 0) ||
        (a.d ?? '').localeCompare(b.d ?? '') ||
        (a.s.event_start ?? '').localeCompare(b.s.event_start ?? '') ||
        a.i - b.i
    )
    .map(({ s }) => s);
}

async function fetchOrderedRail(
  kind: 'category' | 'group',
  slug: string,
  order: string,
  limit: number,
  cityIbge: string | undefined,
  cityIbges: string[] | undefined
): Promise<CategoryRailData | null> {
  const rows = await serverFetchResource<TaxonomyRow>(
    kind === 'group' ? 'categories_group' : 'categories_public',
    { slug, active: 'true' },
    { auth: null, limit: 1 }
  );
  const row = rows[0];
  const id = Number(row?.id);
  if (!row || !Number.isFinite(id)) return null;

  const cities = cityIbges?.length ? cityIbges : null;
  const found = await runServiceSearch(
    {
      ...(kind === 'group' ? { p_group_category_slug: row.slug } : { p_category_id: id }),
      // pool maior que `limit`: quem exibe escolhe dele (foco na cidade + cota das irmãs)
      p_page_size: limit * POOL_FACTOR,
      p_city_ibge: cities?.[0] ?? cityIbge ?? null,
      ...(cities && cities.length > 1 ? { p_city_ibges: cities } : {}),
      p_order: order,
      // impulsionamento: candidatos patrocinados no topo do pool (a trilha sorteia `railSlots`)
      ...(SPONSORED_POOL !== undefined ? { p_sponsored_max: SPONSORED_POOL } : {}),
    },
    seedFromKey(`ordered-rail:${kind}:${row.slug}`)
  );
  if (found.length === 0) return null;

  return {
    kind,
    category: { id, name: row.name, slug: row.slug },
    // pool inteiro, já na ordem; quem exibe corta em `limit`
    // a ordenação por data não pode tirar a vaga patrocinada da frente
    items: pinSponsored(order === 'event_start' ? sortByEventDay(found) : found),
    limit,
    hasMore: found.length > limit,
  };
}

const cachedOrderedRail = unstable_cache(fetchOrderedRail, ['ordered-rail'], {
  revalidate: CACHE_SECONDS,
  tags: ['category-rail'],
});

export async function loadOrderedRail(
  target: { slug?: string; group?: string },
  order: string,
  options: { limit?: number; cityIbge?: string; cityIbges?: string[] } = {}
): Promise<CategoryRailData | null> {
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : DEFAULT_LIMIT;
  const kind = target.group ? 'group' : 'category';
  const slug = (target.group ?? target.slug ?? '').trim();
  if (!slug) return null;
  return cachedOrderedRail(kind, slug, order, limit, options.cityIbge, options.cityIbges).catch(
    () => null
  );
}
