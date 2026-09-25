import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchPage } from '@kizuna/core/client/components/search/search-page';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || null;
}

/**
 * `/busca` sincroniza filtro <-> URL (`q`, `cityName`, `group`, `categoryId`, …) — aqui só usa o
 * que já vem legível na URL (`q`, `cityName`) pra dar title/description/canonical únicos por
 * combinação, sem SSR dos resultados (a página em si é client-side). O canonical inclui a
 * querystring quando ela muda o conteúdo, senão o Google ignoraria as variações com filtro.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const query = firstValue(params.q);
  const cityName = firstValue(params.cityName);

  const subject = query || 'Prestadores de serviço';
  const title = cityName ? `${subject} em ${cityName}` : subject;
  const description = cityName
    ? `Encontre e contrate ${subject.toLowerCase()} em ${cityName}, com filtros por categoria e preço.`
    : 'Encontre prestadores de serviço perto de você, com filtros por categoria, cidade e preço.';

  const qs = new URLSearchParams();
  if (query) qs.set('q', query);
  if (cityName) qs.set('cityName', cityName);
  const path = qs.toString() ? `/busca?${qs.toString()}` : '/busca';

  return { title, description, alternates: { canonical: path } };
}

export default function BuscaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      }
    >
      {/* Para o modo "Pedir um serviço" (demandas), passe `requestMode` aqui — ver SearchPageProps. */}
      <SearchPage />
    </Suspense>
  );
}
