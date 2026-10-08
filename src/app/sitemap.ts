import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { loadRoutableCities } from '@kizuna/core/server/location/cities';

// Páginas públicas. Adicione aqui as rotas públicas do seu app.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = cfg.site?.url ?? 'http://localhost:3000';
  const cities = await loadRoutableCities().catch(() => []);
  return [
    { url: `${url}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${url}/sobre`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${url}/contato`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${url}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${url}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    ...cities.map((city) => ({
      url: `${url}${cityPath(city)}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
