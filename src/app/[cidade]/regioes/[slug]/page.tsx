import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { getEntry } from '@kizuna/core/server/content';
import { resolveCitySlug } from '@kizuna/core/server/location/cities';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { CityRouteMarker } from '@kizuna/core/client/components/city/city-route-marker';
import { AdPhotoMosaic } from '@kizuna/core/client/components/services/detail/ad-photo-mosaic';
import {
  ArticleBody,
  ArticleCredits,
  ArticleHeader,
  ArticleLayout,
  LocationMap,
} from '@kizuna/core/client/components/content';
import { PlaceGrid } from '@kizuna/core/client/components/turismo';
import { JsonLd } from '@/components/turismo/turismo-parts';
import { REGIOES, loadTurismo } from '@/lib/turismo';
import { destinationJsonLd } from '@/lib/turismo-seo';
import { SEO_SITE } from '@/lib/seo';

type Props = { params: Promise<{ cidade: string; slug: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string; slug: string }[] {
  return [];
}

/** Região aprovada E da cidade da URL; qualquer outro caso vira 404. */
const load = cache(async (cidade: string, slug: string) => {
  const city = await resolveCitySlug(cidade);
  if (!city) return null;
  const entry = getEntry(REGIOES, slug);
  if (!entry || entry.data.cidade !== cidade) return null;
  const data = loadTurismo({ citySlugs: [cidade] });
  const regiao = data.regioes.find((r) => r.slug === slug);
  if (!regiao) return null;
  const places = [...data.atracoes, ...data.dormir, ...data.comer].filter((l) => l.regiao === slug);
  return { city, entry, regiao, places };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidade, slug } = await params;
  const found = await load(cidade, slug);
  if (!found) return { title: 'Região não encontrada' };
  return buildMetadata(SEO_SITE, {
    title: `${found.regiao.title}, ${found.city.name}: o que ver e onde ficar`,
    description: found.regiao.summary,
    path: cityPath(found.city, `/regioes/${slug}`),
    image: found.entry.media[0] ?? null,
    type: 'article',
  });
}

export default async function RegiaoRoute({ params }: Props) {
  const { cidade, slug } = await params;
  const found = await load(cidade, slug);
  if (!found) notFound();
  const { city, entry, regiao, places } = found;
  const lat = typeof entry.data.latitude === 'number' ? entry.data.latitude : null;
  const lng = typeof entry.data.longitude === 'number' ? entry.data.longitude : null;
  const credits = typeof entry.data.creditos === 'string' ? entry.data.creditos : '';

  return (
    <>
      <CityRouteMarker city={city} />
      <ArticleLayout
        header={
          <ArticleHeader
            kicker={`Região · ${city.name}`}
            title={regiao.title}
            summary={regiao.summary}
            updatedAt={String(entry.data.atualizado_em ?? '')}
          />
        }
        media={entry.media.length > 0 ? <AdPhotoMosaic photos={entry.media} alt={regiao.title} /> : null}
        aside={lat !== null && lng !== null ? <LocationMap lat={lat} lng={lng} title={regiao.title} /> : undefined}
        footer={credits ? <ArticleCredits text={credits} /> : null}
      >
        <ArticleBody markdown={entry.body} />
        {places.length > 0 ? (
          <section className="mt-10" aria-labelledby="lugares-da-regiao">
            <h2 id="lugares-da-regiao" className="mb-5 font-display text-xl font-black tracking-tight sm:text-2xl">
              Para conhecer em {regiao.title}
            </h2>
            <PlaceGrid items={places} />
          </section>
        ) : null}
      </ArticleLayout>
      <JsonLd
        data={destinationJsonLd(SEO_SITE, {
          name: regiao.title,
          description: regiao.summary,
          path: regiao.href,
          image: entry.media[0] ?? null,
          geo: lat !== null && lng !== null ? { lat, lng } : null,
        })}
      />
    </>
  );
}
