import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { TurismoPlacesPage } from '@/components/turismo/turismo-parts';
import { loadTurismo } from '@/lib/turismo';
import { SEO_SITE } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'O que fazer em Cuiabá e região: atrações e passeios',
  description: 'Atrações, passeios e programas em Cuiabá, Várzea Grande e Chapada dos Guimarães.',
  path: '/turismo/o-que-fazer',
  image: null,
});

export default function OQueFazerPage() {
  const data = loadTurismo();
  return (
    <TurismoPlacesPage
      title="O que fazer"
      summary="Passeios, atrações e programas para o dia, o fim de semana ou a viagem inteira."
      currentHref="/turismo/o-que-fazer"
      places={data.atracoes}
      regioes={data.regioes}
      emptyDescription="Estamos conferindo cada atração antes de publicar. Volte em breve."
    />
  );
}
