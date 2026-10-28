import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { RouteCard, TurismoEmpty, TurismoGrid } from '@kizuna/core/client/components/turismo';
import { TurismoListPage, toRouteCard } from '@/components/turismo/turismo-parts';
import { loadTurismo } from '@/lib/turismo';
import { SEO_SITE } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'Rotas turísticas em Cuiabá e região',
  description: 'Roteiros com paradas, duração e dificuldade: natureza, gastronomia, cicloturismo, city tour e mais.',
  path: '/turismo/rotas',
  image: null,
});

export default function RotasPage() {
  const { rotas } = loadTurismo();
  return (
    <TurismoListPage
      title="Rotas turísticas"
      summary="Escolha um roteiro, veja as paradas na ordem e saia de casa com o dia planejado."
      currentHref="/turismo/rotas"
      items={rotas.map((r) => ({ name: r.title, path: r.href }))}
    >
      {rotas.length > 0 ? (
        <TurismoGrid>
          {rotas.map((r) => (
            <RouteCard key={r.href} item={toRouteCard(r)} />
          ))}
        </TurismoGrid>
      ) : (
        <TurismoEmpty
          title="As rotas estão a caminho"
          description="Estamos montando e conferindo cada roteiro. Enquanto isso, veja outros lugares para ir."
          actionHref="/turismo"
          actionLabel="Voltar ao turismo"
        />
      )}
    </TurismoListPage>
  );
}
