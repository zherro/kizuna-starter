import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchPage } from '@kizuna/core/client/components/search/search-page';
import type { ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';
import { trackRule } from '@/lib/analytics';
import { AdSlot } from '@kizuna/core/client/ads';
import { adsConfig } from '@/lib/ads';
import { parseRegions } from '@kizuna/core/shared/regions';
import cfg from '@/../kizuna.config.json';

// O carrossel de categorias da busca segue EXATAMENTE a regra do da home: as mesmas chaves de
// `home` no kizuna.config.json (variante e "só categorias com anúncio publicado").
const home = (cfg as { home?: { categoriesVariant?: string; categoriesOnlyWithListings?: boolean } })
  .home;
// Categorias com layout de detalhe próprio (ex. cinema) podem sair do resultado misto — ver
// `serviceDetail.excludeFromMixedCategorySlugs` no kizuna.config.json.
const serviceDetailConfig: ServiceDetailConfig | null =
  (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;
const excludeFromMixedCategorySlugs = serviceDetailConfig?.excludeFromMixedCategorySlugs ?? [];
// `search.ai` no kizuna.config.json: false desativa a busca com IA (assistente). Omitido = ligado.
const aiEnabled = (cfg as { search?: { ai?: boolean } }).search?.ai !== false;
// Cidades vizinhas sugeridas abaixo dos resultados (kizuna.config.json → regions).
const regions = parseRegions((cfg as { regions?: unknown }).regions);

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

  const subject = query || 'O que fazer';
  const title = cityName ? `${subject} em ${cityName}` : query || 'Buscar eventos, lugares e lazer';
  const description = query
    ? `Resultados para “${query}”${cityName ? ` em ${cityName}` : ''}: eventos, lugares e dicas de lazer, com filtros por categoria e preço.`
    : `Eventos, lugares e dicas de lazer${cityName ? ` em ${cityName}` : ' perto de você'}, com filtros por categoria e preço.`;

  const qs = new URLSearchParams();
  if (query) qs.set('q', query);
  if (cityName) qs.set('cityName', cityName);
  const path = qs.toString() ? `/busca?${qs.toString()}` : '/busca';

  return {
    title,
    description,
    alternates: { canonical: path },
    // Next substitui (não mescla) o openGraph/twitter do layout: a imagem precisa vir junto.
    openGraph: { title, description, url: path, images: ['/opengraph-image.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/opengraph-image.png'] },
  };
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
      <SearchPage
        categoryCarousel={{
          variant: home?.categoriesVariant === 'compact' ? 'compact' : 'classic',
          onlyWithListings: home?.categoriesOnlyWithListings === true,
        }}
        excludeFromMixedCategorySlugs={excludeFromMixedCategorySlugs}
        serviceDetailConfig={serviceDetailConfig}
        aiEnabled={aiEnabled}
        regions={regions}
        impressionRule={trackRule('service', 'impression')}
        sponsoredSlot={
          <AdSlot
            slot="busca-patrocinado"
            inline
            adsenseClient={adsConfig.adsenseClient}
            maxPerPage={adsConfig.maxSlotsPerPage}
          />
        }
      />
    </Suspense>
  );
}
