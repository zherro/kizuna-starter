import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { resolveCitySlug } from '@kizuna/core/server/location/cities';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { CityRouteMarker } from '@kizuna/core/client/components/city/city-route-marker';
import { HojeContent } from '@/components/hoje/hoje-content';
import { SEO_SITE } from '@/lib/seo';

type Props = { params: Promise<{ cidade: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidade } = await params;
  const city = await resolveCitySlug(cidade);
  if (!city) return { title: 'Cidade não encontrada' };
  return buildMetadata(SEO_SITE, {
    title: `O que fazer hoje em ${city.name}: eventos, cinema, bares e parques`,
    description: `Veja o que tem para fazer hoje em ${city.name} e região: eventos do dia, filmes em cartaz, bares e parques para aproveitar.`,
    path: cityPath(city, '/hoje'),
    image: null,
  });
}

export default async function CidadeHojePage({ params }: Props) {
  const { cidade } = await params;
  const city = await resolveCitySlug(cidade);
  if (!city) notFound();
  return (
    <>
      <CityRouteMarker city={city} />
      <HojeContent city={city} />
    </>
  );
}
