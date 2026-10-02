import { unstable_cache } from 'next/cache';
import { listLocationCities } from '@kizuna/core/server';
import { findCityBySlug, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';

/** Cidades atendidas (`location_city.search_city`), em cache de 5 min — mesma janela das rotas. */
export const loadRoutableCities = unstable_cache(
  async (): Promise<RoutableCity[]> => {
    const items = await listLocationCities(null);
    return items.map((c) => ({
      ibge: c.value,
      name: c.label,
      state: c.stateCode,
      stateName: c.stateName,
    }));
  },
  ['routable-cities'],
  { revalidate: 300 }
);

export async function resolveCitySlug(slug: string): Promise<RoutableCity | undefined> {
  return findCityBySlug(await loadRoutableCities(), slug);
}
