import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { HomePage } from '@/components/home-page';
import { CityRouteMarker } from '@/components/city-route-marker';
import { SEO_SITE } from '@/lib/seo';
import { resolveCitySlug } from '@/lib/server/cities';

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
    title: `Serviços em ${city.name}, ${city.state}`,
    description: `Encontre e contrate prestadores de serviço em ${city.name}, com filtros por categoria e preço.`,
    path: cityPath(city),
    image: null,
  });
}

export default async function CityHomePage({ params }: Props) {
  const { cidade } = await params;
  const city = await resolveCitySlug(cidade);
  if (!city) notFound();

  return (
    <>
      <CityRouteMarker city={city} />
      <HomePage city={city} />
    </>
  );
}
