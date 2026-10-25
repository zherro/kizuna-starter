import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { HomePage } from '@/components/home-page';
import { AdSlot } from '@kizuna/core/client/ads';
import { adsConfig } from '@/lib/ads';
import { CityRouteMarker } from '@kizuna/core/client/components/city/city-route-marker';
import { SEO_SITE } from '@/lib/seo';
import { resolveCitySlug } from '@kizuna/core/server/location/cities';

type Props = { params: Promise<{ cidade: string }> };

export const revalidate = 900;
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
    title: `O que fazer em ${city.name}, ${city.state}: eventos, lugares e lazer`,
    description: `Eventos, shows, lugares para ir e dicas de lazer e cultura em ${city.name}. Veja o que rola hoje, no fim de semana e onde curtir.`,
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
      <AdSlot slot="cidade-topo" city={city.name} adsenseClient={adsConfig.adsenseClient} maxPerPage={adsConfig.maxSlotsPerPage} />
      <HomePage city={city} />
    </>
  );
}
