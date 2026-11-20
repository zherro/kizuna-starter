import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { TurismoPlacesPage } from '@/components/turismo/turismo-parts';
import { loadTurismo } from '@/lib/turismo';
import { SEO_SITE } from '@/lib/seo';
import { turismoHasItems, withIndexing } from '@/lib/seo-index';

export const revalidate = 300;

// Listagem vazia ("Volte em breve") fica fora do índice até ter item publicado.
export function generateMetadata(): Metadata {
  return withIndexing(
    buildMetadata(SEO_SITE, {
      title: 'Onde dormir em Cuiabá e região: hotéis e pousadas',
      description: 'Hospedagens em Cuiabá, Várzea Grande e Chapada dos Guimarães, com faixa de preço e região.',
      path: '/turismo/dormir',
      image: null,
    }),
    turismoHasItems(loadTurismo(), 'dormir')
  );
}

export default function DormirPage() {
  const data = loadTurismo();
  return (
    <TurismoPlacesPage
      title="Onde dormir"
      summary="Pousadas, hotéis e hospedagens para todos os bolsos, de Cuiabá à Chapada."
      currentHref="/turismo/dormir"
      places={data.dormir}
      regioes={data.regioes}
      emptyDescription="Estamos visitando e conferindo cada hospedagem antes de publicar. Volte em breve."
    />
  );
}
