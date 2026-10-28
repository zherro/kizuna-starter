import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CalendarDays, Clock, Gauge, MapPin, Route as RouteIcon } from 'lucide-react';
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
  FactSheet,
} from '@kizuna/core/client/components/content';
import { StopTimeline, dificuldadeInfo, paradasLabel } from '@kizuna/core/client/components/turismo';
import { JsonLd } from '@/components/turismo/turismo-parts';
import { ROTEIROS, loadTurismo } from '@/lib/turismo';
import { tripJsonLd } from '@/lib/turismo-seo';
import { SEO_SITE } from '@/lib/seo';

type Props = { params: Promise<{ cidade: string; slug: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string; slug: string }[] {
  return [];
}

/** Roteiro aprovado E da cidade da URL; qualquer outro caso vira 404. */
const load = cache(async (cidade: string, slug: string) => {
  const city = await resolveCitySlug(cidade);
  if (!city) return null;
  const entry = getEntry(ROTEIROS, slug);
  if (!entry || entry.data.cidade !== cidade) return null;
  const rota = loadTurismo({ citySlugs: [cidade] }).rotas.find((r) => r.slug === slug);
  if (!rota) return null;
  return { city, entry, rota };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidade, slug } = await params;
  const found = await load(cidade, slug);
  if (!found) return { title: 'Roteiro não encontrado' };
  return buildMetadata(SEO_SITE, {
    title: `${found.rota.title} em ${found.city.name}`,
    description: found.rota.summary,
    path: cityPath(found.city, `/roteiros/${slug}`),
    image: found.entry.media[0] ?? null,
    type: 'article',
  });
}

export default async function RoteiroRoute({ params }: Props) {
  const { cidade, slug } = await params;
  const found = await load(cidade, slug);
  if (!found) notFound();
  const { city, entry, rota } = found;
  const dif = dificuldadeInfo(rota.dificuldade);
  const credits = typeof entry.data.creditos === 'string' ? entry.data.creditos : '';

  const facts = [
    { icon: Clock, label: 'Duração', value: rota.duracao },
    { icon: Gauge, label: 'Dificuldade', value: dif?.label ?? null },
    { icon: RouteIcon, label: 'Distância', value: rota.distancia },
    { icon: CalendarDays, label: 'Melhor época', value: rota.melhorEpoca },
    { icon: MapPin, label: 'Paradas', value: rota.paradas.length > 0 ? paradasLabel(rota.paradas.length) : null },
  ];

  return (
    <>
      <CityRouteMarker city={city} />
      <ArticleLayout
        header={
          <ArticleHeader
            kicker={`${rota.tema ?? 'Roteiro'} · ${city.name}`}
            title={rota.title}
            summary={rota.summary}
            updatedAt={String(entry.data.atualizado_em ?? '')}
          />
        }
        media={entry.media.length > 0 ? <AdPhotoMosaic photos={entry.media} alt={rota.title} /> : null}
        aside={facts.some((f) => f.value) ? <FactSheet title="Sobre o roteiro" rows={facts} /> : undefined}
        footer={credits ? <ArticleCredits text={credits} /> : null}
      >
        <ArticleBody markdown={entry.body} />
        <div className="mt-10">
          <StopTimeline
            stops={rota.paradas.map((p) => ({ title: p.title, href: p.href, address: p.address, photo: p.photo }))}
          />
        </div>
      </ArticleLayout>
      <JsonLd
        data={tripJsonLd(SEO_SITE, {
          name: rota.title,
          description: rota.summary,
          path: rota.href,
          image: entry.media[0] ?? null,
          paradas: rota.paradas.map((p) => ({ name: p.title, path: p.href })),
        })}
      />
    </>
  );
}
