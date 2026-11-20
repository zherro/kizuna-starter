import { describe, expect, it, vi } from 'vitest';

vi.mock('@kizuna/core/server/postgrest-crud', () => ({ serverFetchResource: vi.fn() }));

import { loadCategoryRailItems } from './category-rail-items';

const rows: Record<string, unknown[]> = {
  category_stats: [
    { id: 11, categoryId: 2, categoryName: 'Shows', categoryGroupId: 10 },
    { id: 13, categoryId: 1, categoryName: 'Bares', categoryGroupId: 20 },
  ],
  category_service_stats: [
    { id: 2, categoryId: 2, servicesCount: 3 },
    { id: 1, categoryId: 1, servicesCount: 0 },
  ],
  categories_group_public: [
    { id: 10, name: 'Eventos', slug: 'eventos', sortOrder: 1 },
    { id: 20, name: 'Comer e beber', slug: 'comer', sortOrder: 2 },
  ],
  category_service_facets: [{ id: 2, categoryId: 2, groupIds: [10] }],
};

function fakeFetch(failing: string[] = []) {
  const calls: string[] = [];
  const fetchRows = async <T,>(resource: string): Promise<T[]> => {
    calls.push(resource);
    if (failing.includes(resource)) throw new Error(`falhou ${resource}`);
    return (rows[resource] ?? []) as T[];
  };
  return { calls, fetchRows };
}

describe('loadCategoryRailItems', () => {
  it('monta os cards por grupo no servidor, só com anúncio (facetas)', async () => {
    const { calls, fetchRows } = fakeFetch();
    const items = await loadCategoryRailItems({ groupBy: 'group', onlyWithListings: true }, fetchRows);
    expect(items).toEqual([{ id: 10, name: 'Eventos', slug: 'eventos', icon: null, count: 1 }]);
    expect(calls.sort()).toEqual(
      ['categories_group_public', 'category_service_facets', 'category_service_stats', 'category_stats'].sort()
    );
  });

  it('sem onlyWithListings não lê contagem nem facetas', async () => {
    const { calls, fetchRows } = fakeFetch();
    const items = await loadCategoryRailItems({ groupBy: 'group', onlyWithListings: false }, fetchRows);
    expect(items?.map((g) => g.slug)).toEqual(['eventos', 'comer']);
    expect(calls.sort()).toEqual(['categories_group_public', 'category_stats']);
  });

  it('facetas indisponíveis: cai no grupo primário (igual ao cliente)', async () => {
    const { fetchRows } = fakeFetch(['category_service_facets']);
    const items = await loadCategoryRailItems({ groupBy: 'group', onlyWithListings: true }, fetchRows);
    expect(items?.map((g) => [g.slug, g.count])).toEqual([['eventos', 1]]);
  });

  it('taxonomia indisponível: undefined, e o carrossel volta a buscar no cliente', async () => {
    for (const failing of ['category_stats', 'category_service_stats', 'categories_group_public']) {
      const { fetchRows } = fakeFetch([failing]);
      expect(await loadCategoryRailItems({ groupBy: 'group', onlyWithListings: true }, fetchRows)).toBeUndefined();
    }
  });
});
