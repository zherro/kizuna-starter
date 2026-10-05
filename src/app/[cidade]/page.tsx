import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { HomePage } from '@/components/home-page';
import { CityRouteMarker } from '@kizuna/core/client/components/city/city-route-marker';
import { SEO_SITE } from '@/lib/seo';
import { resolveCitySlug } from '@kizuna/core/server/location/cities';

type Props = { params: Promise<{ cidade: string }> };

export const revalidate = 300;
// ISR de verdade: os loaders do core leem o PostgREST com `no-store` e alguns engolem erro com
// `.catch(() => [])`, o que esconde do Next o "bail out" para dinâmico no 1º render e estoura
// "Page changed from static to dynamic at runtime" em prd. `force-static` faz esses fetches
// entrarem no cache da página, renovado a cada `revalidate`.
export const dynamic = 'force-static';
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
