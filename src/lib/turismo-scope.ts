import { citySlug, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { loadRoutableCities } from '@kizuna/core/server/location/cities';
import { parseRegions, regionCitiesFor } from '@kizuna/core/shared/regions';
import cfg from '@/../kizuna.config.json';

const regions = parseRegions((cfg as { regions?: unknown }).regions);

/** IBGE da Chapada dos Guimarães (faz parte da praça da Grande Cuiabá). */
export const CHAPADA_IBGE = '5103007';

/** Slugs de cidade da praça de `city` (a cidade primeiro, depois as irmãs de `regions`). */
export async function plazaCitySlugs(city: RoutableCity): Promise<string[]> {
  const all = await loadRoutableCities().catch(() => [] as RoutableCity[]);
  const slugs = regionCitiesFor(regions, city.ibge)
    .map((ibge) => all.find((c) => String(c.ibge) === ibge))
    .filter((c): c is RoutableCity => Boolean(c))
    .map((c) => citySlug(c.name, c.state));
  // Cidade fora da lista roteável (ou sem banco) ainda tem a própria página.
  return slugs.length > 0 ? slugs : [citySlug(city.name, city.state)];
}

/** Slug da Chapada (ou o derivado de nome+UF quando a lista de cidades não está disponível). */
export async function chapadaSlug(): Promise<string> {
  const all = await loadRoutableCities().catch(() => [] as RoutableCity[]);
  const c = all.find((x) => String(x.ibge) === CHAPADA_IBGE);
  return c ? citySlug(c.name, c.state) : 'chapada-dos-guimaraes-mt';
}
