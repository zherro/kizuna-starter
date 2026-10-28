import type { Metadata } from 'next';
import { buildMetadata, parseLocationConfig } from '@kizuna/core/server';
import { loadRoutableCities } from '@kizuna/core/server/location/cities';
import { HojeContent } from '@/components/hoje/hoje-content';
import { SEO_SITE } from '@/lib/seo';
import cfg from '@/../kizuna.config.json';

export const revalidate = 300;

const locationConfig = parseLocationConfig((cfg as { location?: unknown }).location);

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'O que fazer hoje em Cuiabá: eventos, cinema, bares e parques',
  description:
    'Veja o que tem para fazer hoje em Cuiabá e região: eventos do dia, filmes em cartaz, bares e parques para aproveitar.',
  path: '/hoje',
  image: null,
});

export default async function HojePage() {
  // Sem cidade na URL, usa a cidade padrão do projeto (location.defaultCityIbge), como a home.
  const cities = await loadRoutableCities().catch(() => []);
  const city = cities.find((c) => c.ibge === locationConfig.defaultCityIbge) ?? null;
  return <HojeContent city={city} />;
}
