import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchPage } from '@kizuna/core/client/components/search/search-page';
import { SearchBrowseRailsStatic } from '@kizuna/core/client/components/search/search-browse-rails-static';
import { normalizeBrowseRails, type BrowseRailConfig } from '@kizuna/core/shared/search/browse-rails';
import type { ExpiredByGroup } from '@kizuna/core/client/components/search/expired';
import type { ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';
import { trackRule } from '@/lib/analytics';
import { AdSlot } from '@kizuna/core/client/ads';
import { adsConfig } from '@/lib/ads';
import { parseRegions, regionCitiesFor } from '@kizuna/core/shared/regions';
import { buildMetadata, loadBrowseRails, parseLocationConfig } from '@kizuna/core/server';
import { loadRoutableCities } from '@kizuna/core/server/location/cities';
import { SEO_SITE } from '@/lib/seo';
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
// `search.defaultGroup` (grupo marcado ao chegar sem filtro) e `search.orderByGroup` (ordem por grupo).
const searchCfg = (
  cfg as {
    search?: {
      defaultGroup?: string | null;
      orderByGroup?: Record<string, string>;
      browseGroups?: BrowseRailConfig[];
      expired?: ExpiredByGroup;
    };
  }
).search;
const searchDefaults = {
  defaultGroupSlug: searchCfg?.defaultGroup ?? null,
  orderByGroup: searchCfg?.orderByGroup,
  // `search.expired`: grupos que mostram vencidos recentes, com selo (ex. eventos "Já aconteceu").
  expiredByGroup: searchCfg?.expired,
};
// `search.browseGroups`: sem filtro além da cidade, um carrossel por item (grupo ou grupos juntos), nesta ordem.
const browseGroups = searchCfg?.browseGroups ?? [];
// Cidades vizinhas sugeridas abaixo dos resultados (kizuna.config.json → regions).
const regions = parseRegions((cfg as { regions?: unknown }).regions);

// Casca estática (ISR): sem searchParams no servidor — filtros da URL são lidos no cliente. As trilhas do
// estado "sem filtro" vão renderizadas no servidor (cidade padrão) como fallback do Suspense, que é o que
// vai no HTML estático (useSearchParams faz o resto cair em CSR até esse limite).
export const revalidate = 300;
export const dynamic = 'force-static';

const locationConfig = parseLocationConfig((cfg as { location?: unknown }).location);

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'Buscar eventos, lugares e lazer',
  description: 'Eventos, lugares e dicas de lazer perto de você, com filtros por categoria e preço.',
  path: '/busca',
  image: null,
});

/** Trilhas da vitrine para a cidade padrão do projeto; qualquer falha = null (cliente busca como sempre). */
async function loadInitialRails() {
  try {
    const rails = normalizeBrowseRails(browseGroups);
    if (!rails.length || !locationConfig.defaultCityIbge) return null;
    const cities = await loadRoutableCities().catch(() => []);
    const city = cities.find((c) => c.ibge === locationConfig.defaultCityIbge);
    if (!city) return null;
    return await loadBrowseRails({
      rails,
      cityIbge: city.ibge,
      cityIbges: regionCitiesFor(regions, city.ibge),
      state: city.state,
      orderByGroup: searchCfg?.orderByGroup,
    });
  } catch {
    return null;
  }
}

export default async function BuscaPage() {
  const initialRails = await loadInitialRails();
  return (
    <Suspense
      fallback={
        initialRails ? (
          <SearchBrowseRailsStatic
            data={initialRails}
            detailConfig={serviceDetailConfig}
            impressionRule={trackRule('service', 'impression')}
          />
        ) : (
          <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        )
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
        defaults={searchDefaults}
        browseGroups={browseGroups}
        initialRails={initialRails ?? undefined}
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
