import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import type { Metadata } from 'next';
import {
  loadServiceDetail,
  buildMetadata,
  serviceJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
  stripHtml,
} from '@kizuna/core/server';
import { ServiceDetailPage, type ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';
import { photosFor } from '@kizuna/core/client/components/services/service-helpers';
import { SEO_SITE } from '@/lib/seo';
import cfg from '../../../../kizuna.config.json';

type Props = { params: Promise<{ uid: string }> };

const serviceDetailConfig: ServiceDetailConfig | null =
  (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;

/**
 * Carrega tudo que a página precisa num único cache por uid (ISR de 5 min — leitura 100% anônima
 * e pública; um anúncio editado aparece em até 5 min). `notFound()` fica fora daqui: não pode
 * rodar dentro de `unstable_cache`.
 */
const loadAd = unstable_cache(
  (uid: string) => loadServiceDetail(uid),
  ['anuncio-detalhe'],
  { revalidate: 300 }
);

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { uid: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) return { title: 'Anúncio não encontrado' };

  const photos = photosFor(data.service);
  return buildMetadata(SEO_SITE, {
    title: data.service.title,
    description:
      stripHtml(data.service.description) || `${data.service.title} — veja detalhes no ${SEO_SITE.name}.`,
    path: `/anuncios/${data.service.uid}`,
    image: photos[0] ?? null,
  });
}

export default async function AnuncioPage({ params }: Props) {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) notFound();

  const path = `/anuncios/${data.service.uid}`;
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
      <ServiceDetailPage data={data} detailConfig={serviceDetailConfig} path={path} />
    </>
  );
}
