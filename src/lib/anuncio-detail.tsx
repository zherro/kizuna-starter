import { unstable_cache } from 'next/cache';
import type { Metadata } from 'next';
import {
  loadServiceDetail,
  buildMetadata,
  serviceJsonLd,
  absoluteUrl,
  breadcrumbJsonLd,
  jsonLdScript,
  stripHtml,
  type ServiceDetailData,
} from '@kizuna/core/server';
// Imports diretos (não o barrel `services/detail`): o barrel reexporta carrosséis, botões e outros
// componentes cliente que esta página não usa e que entrariam no grafo/bundle da rota.
import { ServiceDetailPage } from '@kizuna/core/client/components/services/detail/service-detail-page';
import {
  resolveServiceDetailVariant,
  type ServiceDetailConfig,
} from '@kizuna/core/client/components/services/detail/category-style';
import { newsArticleMeta } from '@kizuna/core/client/components/services/detail/noticia-helpers';
import { photosFor } from '@kizuna/core/client/components/services/service-helpers';
import { serverFetchResource } from '@kizuna/core/server/postgrest-crud';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { SEO_SITE } from '@/lib/seo';
import { NEWS_TIME_ZONE } from '@/lib/noticias';
import { trackRule } from '@/lib/analytics';
import { linkEditorialPlaces } from '@/lib/lugar-links';
import { findEditorialPlace } from '@/lib/lugares';
import cfg from '../../kizuna.config.json';
import { AD_DETAIL_TAG } from '@/lib/server/revalidate-ad-pages';
import { adNoIndexReason, withIndexing } from '@/lib/seo-index';
import { eventJsonLd } from '@/lib/event-jsonld';

const serviceDetailConfig: ServiceDetailConfig | null =
  (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;

/**
 * Carrega tudo que a página precisa num único cache por uid (ISR de 5 min — leitura 100% anônima
 * e pública). Salvar no painel expira a tag `AD_DETAIL_TAG` (`revalidate-ad-pages`). `notFound()` fica fora daqui: não pode
 * rodar dentro de `unstable_cache`.
 */
export const loadAd = unstable_cache(
  (uid: string) => loadServiceDetail(uid),
  ['anuncio-detalhe'],
  { revalidate: 300, tags: [AD_DETAIL_TAG] }
);

type AddressIbgeRow = { cityIbge?: string | null; city_ibge?: string | null };

/** IBGE do endereço principal (ativo) do anúncio — só para o `noindex`; falha = `null` (não decide nada). */
const loadAdAddressIbge = unstable_cache(
  async (serviceId: string): Promise<string | null> => {
    const rows = await serverFetchResource<AddressIbgeRow>(
      'service_addresses',
      { service_id: serviceId, active: 'true' },
      { auth: null, limit: 1, orderBy: 'is_primary', orderDirection: 'desc' }
    ).catch(() => [] as AddressIbgeRow[]);
    const ibge = String(rows[0]?.cityIbge ?? rows[0]?.city_ibge ?? '').trim();
    return ibge || null;
  },
  ['anuncio-endereco-ibge'],
  { revalidate: 300, tags: [AD_DETAIL_TAG] }
);

export async function anuncioMetadata(data: ServiceDetailData, path: string): Promise<Metadata> {
  const photos = photosFor(data.service);
  const addressIbge = await loadAdAddressIbge(String(data.service.id));
  // Evento que já passou e anúncio de fora da região do portal seguem no ar, mas fora do índice
  // (`noindex, follow`) e do sitemap — mesma regra em `sitemap-ads.ts`.
  return withIndexing(
    buildMetadata(SEO_SITE, {
      title: data.service.title,
      description:
        stripHtml(data.service.description) ||
        `${data.service.title} — veja detalhes no ${SEO_SITE.name}.`,
      path,
      image: photos[0] ?? null,
    }),
    adNoIndexReason(data, Date.now(), addressIbge) === null
  );
}

export function AnuncioDetail({ data: loaded, path }: { data: ServiceDetailData; path: string }) {
  const data = linkEditorialPlaces(loaded.service, loaded, findEditorialPlace);
  const photos = photosFor(data.service);
  // Lugar (shopping, loja, parque) e notícia: o anúncio não é uma oferta — sem preço nem
  // prestador no JSON-LD, como na tela.
  const variant = resolveServiceDetailVariant(
    { slug: data.service.category?.slug, groupSlug: data.service.categoryGroup?.slug },
    serviceDetailConfig
  );
  const isPlace = variant === 'lugar' || variant === 'noticia';

  const serviceLd = serviceJsonLd(SEO_SITE, {
    name: data.service.title,
    description: stripHtml(data.service.description),
    path,
    image: photos[0] ?? null,
    price: !isPlace && data.service.priceUnit !== 'quote' ? data.service.startingPrice : null,
    category: data.service.category?.name ?? null,
    providerName: isPlace ? null : data.provider?.full_name || data.provider?.display_name || null,
  });
  // Notícia: `NewsArticle` (Discover, Top Stories e IAs) em vez do `Service` genérico.
  const articleLd =
    variant === 'noticia'
      ? (() => {
          const meta = newsArticleMeta(data.service, data.extraFields, {
            subcategoryNames: data.subcategoryNames,
            timeZone: NEWS_TIME_ZONE,
          });
          const published = meta.publishedAt?.toISOString();
          return {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: data.service.title.slice(0, 110),
            description: stripHtml(data.service.description),
            url: absoluteUrl(SEO_SITE, path),
            mainEntityOfPage: absoluteUrl(SEO_SITE, path),
            image: photos[0] ? [absoluteUrl(SEO_SITE, photos[0])] : undefined,
            datePublished: published,
            dateModified: published,
            articleSection: meta.category,
            inLanguage: 'pt-BR',
            author: { '@type': meta.author ? 'Person' : 'Organization', name: meta.author ?? SEO_SITE.name },
            publisher: { '@type': 'Organization', name: SEO_SITE.name, url: SEO_SITE.url },
          };
        })()
      : null;
  // Evento: `Event` (datas, local, oferta e imagem reais) em vez do `Service` genérico; sem data, cai no `Service`.
  const eventLd =
    variant === 'evento' ? eventJsonLd(SEO_SITE, data, { path, photos, timeZone: NEWS_TIME_ZONE }) : null;
  const breadcrumbLd = breadcrumbJsonLd(SEO_SITE, [
    { name: 'Início', path: '/' },
    ...(data.city ? [{ name: data.city.name, path: cityPath(data.city) }] : []),
    { name: 'Buscar', path: '/busca' },
    { name: data.service.title, path },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(articleLd ?? eventLd ?? serviceLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
      />
      {/* Sem `slots` por enquanto: este projeto ainda não tem plugin de chat/solicitar — a sidebar
          mostra só preço + compartilhar + prestador. Ver `ServiceDetailSlots` pra plugar CTAs. */}
      <ServiceDetailPage
        data={data}
        detailConfig={serviceDetailConfig}
        path={path}
        analytics={{ viewRule: trackRule('service', 'view'), impressionRule: trackRule('service', 'impression') }}
        editHref={`/painel/meus-servicos/${data.service.id}`}
      />
    </>
  );
}
