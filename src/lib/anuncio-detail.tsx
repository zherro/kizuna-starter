import { unstable_cache } from 'next/cache';
import type { Metadata } from 'next';
import {
  loadServiceDetail,
  buildMetadata,
  serviceJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
  stripHtml,
  type ServiceDetailData,
} from '@kizuna/core/server';
import {
  ServiceDetailPage,
  type ServiceDetailConfig,
} from '@kizuna/core/client/components/services/detail';
import { photosFor } from '@kizuna/core/client/components/services/service-helpers';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { SEO_SITE } from '@/lib/seo';
import { trackRule } from '@/lib/analytics';
import cfg from '../../kizuna.config.json';

const serviceDetailConfig: ServiceDetailConfig | null =
  (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;

/**
 * Carrega tudo que a página precisa num único cache por uid (ISR de 5 min — leitura 100% anônima
 * e pública; um anúncio editado aparece em até 5 min). `notFound()` fica fora daqui: não pode
 * rodar dentro de `unstable_cache`.
 */
export const loadAd = unstable_cache(
  (uid: string) => loadServiceDetail(uid),
  ['anuncio-detalhe'],
  { revalidate: 300 }
);

export function anuncioMetadata(data: ServiceDetailData, path: string): Metadata {
  const photos = photosFor(data.service);
  return buildMetadata(SEO_SITE, {
    title: data.service.title,
    description:
      stripHtml(data.service.description) ||
      `${data.service.title} — veja detalhes no ${SEO_SITE.name}.`,
    path,
    image: photos[0] ?? null,
  });
}

export function AnuncioDetail({ data, path }: { data: ServiceDetailData; path: string }) {
  const photos = photosFor(data.service);

  const serviceLd = serviceJsonLd(SEO_SITE, {
    name: data.service.title,
    description: stripHtml(data.service.description),
    path,
    image: photos[0] ?? null,
    price: data.service.priceUnit !== 'quote' ? data.service.startingPrice : null,
    category: data.service.category?.name ?? null,
    providerName: data.provider?.full_name || data.provider?.display_name || null,
  });
  const breadcrumbLd = breadcrumbJsonLd(SEO_SITE, [
    { name: 'Início', path: '/' },
    ...(data.city ? [{ name: data.city.name, path: cityPath(data.city) }] : []),
    { name: 'Buscar', path: '/busca' },
    { name: data.service.title, path },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(serviceLd) }} />
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
        analytics={{ viewRule: trackRule('service', 'view') }}
      />
    </>
  );
}
