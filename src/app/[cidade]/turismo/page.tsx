import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { resolveCitySlug } from '@kizuna/core/server/location/cities';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { CityRouteMarker } from '@kizuna/core/client/components/city/city-route-marker';
import { TurismoLanding } from '@/components/turismo/turismo-parts';
import { loadTurismo } from '@/lib/turismo';
import { plazaCitySlugs } from '@/lib/turismo-scope';
import { SEO_SITE } from '@/lib/seo';

type Props = { params: Promise<{ cidade: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string }[] {
  return [];
}

const load = cache(async (cidade: string) => {
  const city = await resolveCitySlug(cidade);
  return city ? { city, slugs: await plazaCitySlugs(city) } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidade } = await params;
  const found = await load(cidade);
  if (!found) return { title: 'Cidade não encontrada' };
  return buildMetadata(SEO_SITE, {
    title: `Turismo em ${found.city.name}: rotas, onde dormir e onde comer`,
    description: `Rotas turísticas, hospedagens, restaurantes, passeios e regiões em ${found.city.name} e na Grande Cuiabá.`,
    path: cityPath(found.city, '/turismo'),
    image: null,
  });
}

export default async function CidadeTurismoPage({ params }: Props) {
  const { cidade } = await params;
  const found = await load(cidade);
  if (!found) notFound();
  return (
    <>
      <CityRouteMarker city={found.city} />
      <TurismoLanding
        data={loadTurismo({ citySlugs: found.slugs })}
        title={`Turismo em ${found.city.name}`}
        summary={`Rotas, onde dormir, onde comer e o que fazer em ${found.city.name} e nas cidades vizinhas da Grande Cuiabá.`}
      />
    </>
  );
}
