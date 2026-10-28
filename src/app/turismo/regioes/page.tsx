import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { RegionCard, TurismoEmpty, TurismoGrid } from '@kizuna/core/client/components/turismo';
import { TurismoListPage } from '@/components/turismo/turismo-parts';
import { loadTurismo } from '@/lib/turismo';
import { SEO_SITE } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'Regiões e distritos de Cuiabá',
  description: 'Conheça os distritos e as regiões turísticas de Cuiabá e da Grande Cuiabá, com o que ver em cada um.',
  path: '/turismo/regioes',
  image: null,
});

export default function RegioesPage() {
  const { regioes } = loadTurismo();
  return (
    <TurismoListPage
      title="Regiões e distritos"
      summary="Cada região tem sua história, sua paisagem e seus sabores. Veja onde vale a viagem."
      currentHref="/turismo/regioes"
      items={regioes.map((r) => ({ name: r.title, path: r.href }))}
    >
      {regioes.length > 0 ? (
        <TurismoGrid>
          {regioes.map((r) => (
            <RegionCard key={r.href} item={r} />
          ))}
        </TurismoGrid>
      ) : (
        <TurismoEmpty
          title="As regiões estão a caminho"
          description="Estamos escrevendo e conferindo a página de cada distrito."
          actionHref="/turismo"
          actionLabel="Voltar ao turismo"
        />
      )}
    </TurismoListPage>
  );
}
