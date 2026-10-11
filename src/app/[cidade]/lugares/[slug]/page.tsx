import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { getEntry } from '@kizuna/core/server/content';
import { resolveCitySlug } from '@kizuna/core/server/location/cities';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { CityRouteMarker } from '@kizuna/core/client/components/city/city-route-marker';
import { LugarPage } from '@/components/lugares/lugar-page';
import { LUGARES, buildLugarView } from '@/lib/lugares';
import { SEO_SITE } from '@/lib/seo';

type Props = { params: Promise<{ cidade: string; slug: string }> };

// Segmento: mesmos valores do molde `[cidade]/anuncio/[uid]/page.tsx` (ele não define `dynamic`).
export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string; slug: string }[] {
  return [];
}

/** Lugar publicado E da cidade da URL; qualquer outro caso vira 404. `cache`: metadata e página leem 1x. */
const load = cache(async (cidade: string, slug: string) => {
  const city = await resolveCitySlug(cidade);
  if (!city) return null;
  const entry = getEntry(LUGARES, slug);
  if (!entry || entry.data.cidade !== cidade) return null;
  return { city, entry };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidade, slug } = await params;
  const found = await load(cidade, slug);
  if (!found) return { title: 'Lugar não encontrado' };
  const view = buildLugarView(found.entry, found.city.name);
  return buildMetadata(SEO_SITE, {
    title: `${view.title} em ${found.city.name}`,
    description: view.summary,
    path: cityPath(found.city, `/lugares/${slug}`),
    image: view.photos[0] ?? null,
    type: 'article',
  });
}

export default async function LugarRoute({ params }: Props) {
  const { cidade, slug } = await params;
  const found = await load(cidade, slug);
  if (!found) notFound();
  return (
    <>
      <CityRouteMarker city={found.city} />
      <LugarPage view={buildLugarView(found.entry, found.city.name)} />
    </>
  );
}
