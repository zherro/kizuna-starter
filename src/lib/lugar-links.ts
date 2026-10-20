import type { ServiceDetailData } from '@kizuna/core/server';
import { slugify } from '@kizuna/core/client/components/pages/slugify';
import { serviceRefExtras } from '@kizuna/core/shared/service-ref-extras';

type ServiceVenue = NonNullable<ServiceDetailData['venue']>;
type ServiceSalePoint = NonNullable<ServiceDetailData['salePoints']>[number];

/** Lugar editorial (`content/lugares/<slug>`) achado por slug — só o que o link precisa. */
export type EditorialPlace = {
  slug: string;
  title: string;
  cidade: string;
  photo: string | null;
  address: string | null;
};

export type PlaceLookup = (slug: string) => EditorialPlace | null;

type LinkedData = {
  venue?: ServiceVenue | null;
  salePoints?: ServiceSalePoint[];
  extraFields?: { answers?: Record<string, unknown> | null } | null;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function listNames(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => clean(item && typeof item === 'object' ? (item as { nome?: unknown }).nome : item))
    .filter(Boolean);
}

function placeVenue(value: string, lookup: PlaceLookup): ServiceVenue | null {
  const slug = slugify(value);
  const place = slug ? lookup(slug) : null;
  if (!place) return null;
  return {
    uid: `lugar:${place.slug}`,
    title: place.title,
    href: `/${place.cidade}/lugares/${place.slug}`,
    photo: place.photo,
    address: place.address,
    cityName: null,
  };
}

/**
 * Segunda chance pros links de lugar do evento: o core liga o código a um ANÚNCIO; o que ficou sem
 * link (`venue: null`) é tentado aqui como slug de uma página editorial `/[cidade]/lugares/[slug]`.
 * Usa o valor cru de `extras` ou, se vazio, das respostas do formulário (`data.extraFields`, mesma
 * precedência do core: `serviceRefExtras`); o rótulo já vem humanizado. Ordem: anúncio > editorial > texto.
 */
export function linkEditorialPlaces<T extends LinkedData>(
  service: { extras?: Record<string, unknown> | null },
  data: T,
  lookup: PlaceLookup
): T {
  const extras = serviceRefExtras(service, data.extraFields);
  const out = { ...data };

  const localRef = clean(extras.local_ref);
  if (!out.venue && localRef) out.venue = placeVenue(localRef, lookup);

  if (out.salePoints?.length) {
    const raw = listNames(extras.pontos_de_venda);
    out.salePoints = out.salePoints.map((sp, i) => {
      if (sp.venue || !raw[i]) return sp;
      const venue = placeVenue(raw[i], lookup);
      return venue ? { ...sp, label: venue.title, venue } : sp;
    });
  }
  return out;
}
