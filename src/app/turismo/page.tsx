import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { TurismoLanding } from '@/components/turismo/turismo-parts';
import { loadTurismo } from '@/lib/turismo';
import { chapadaSlug } from '@/lib/turismo-scope';
import { SEO_SITE } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'Turismo em Cuiabá e região: rotas, onde dormir e onde comer',
  description:
    'Rotas turísticas, hospedagens, restaurantes, passeios e distritos de Cuiabá, Várzea Grande e Chapada dos Guimarães.',
  path: '/turismo',
  image: null,
});

export default async function TurismoPage() {
  const data = loadTurismo();
  const slug = await chapadaSlug();
  const chapadaData = loadTurismo({ citySlugs: [slug] });
  const hasChapada = chapadaData.rotas.length + chapadaData.atracoes.length > 0;
  return (
    <TurismoLanding
      data={data}
      title="Turismo em Cuiabá e região"
      summary="Rotas prontas, onde dormir, onde comer e o que fazer em Cuiabá, Várzea Grande e Chapada dos Guimarães."
      chapada={hasChapada ? { href: `/${slug}/turismo`, data: chapadaData } : null}
    />
  );
}
