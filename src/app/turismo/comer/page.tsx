import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { TurismoPlacesPage } from '@/components/turismo/turismo-parts';
import { loadTurismo } from '@/lib/turismo';
import { SEO_SITE } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'Onde comer em Cuiabá e região: restaurantes e sabores locais',
  description: 'Restaurantes e casas de comida regional em Cuiabá, Várzea Grande e Chapada dos Guimarães.',
  path: '/turismo/comer',
  image: null,
});

export default function ComerPage() {
  const data = loadTurismo();
  return (
    <TurismoPlacesPage
      title="Onde comer"
      summary="Da peixada ao pequi, os endereços para provar a comida de Mato Grosso."
      currentHref="/turismo/comer"
      places={data.comer}
      regioes={data.regioes}
      emptyDescription="Estamos conferindo endereços e horários de cada restaurante antes de publicar. Volte em breve."
    />
  );
}
