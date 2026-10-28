import { absoluteUrl, type SeoSite } from '@kizuna/core/server';

type Item = { name: string; path: string };

/** ItemList das páginas de listagem (rotas, dormir, comer...). */
export function itemListJsonLd(site: SeoSite, name: string, items: Item[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: absoluteUrl(site, it.path),
    })),
  };
}

/** Roteiro: TouristTrip com as paradas como itinerário (só as que existem e estão aprovadas). */
export function tripJsonLd(
  site: SeoSite,
  input: {
    name: string;
    description: string;
    path: string;
    image?: string | null;
    paradas: Item[];
  }
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: input.name,
    description: input.description,
    url: absoluteUrl(site, input.path),
    image: input.image ? absoluteUrl(site, input.image) : undefined,
    touristType: 'Turistas e moradores',
    itinerary:
      input.paradas.length > 0
        ? {
            '@type': 'ItemList',
            numberOfItems: input.paradas.length,
            itemListElement: input.paradas.map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              item: { '@type': 'TouristAttraction', name: p.name, url: absoluteUrl(site, p.path) },
            })),
          }
        : undefined,
  };
}

/** Região/distrito: TouristDestination, com coordenadas quando houver. */
export function destinationJsonLd(
  site: SeoSite,
  input: {
    name: string;
    description: string;
    path: string;
    image?: string | null;
    geo?: { lat: number; lng: number } | null;
  }
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: input.name,
    description: input.description,
    url: absoluteUrl(site, input.path),
    image: input.image ? absoluteUrl(site, input.image) : undefined,
    geo: input.geo
      ? { '@type': 'GeoCoordinates', latitude: input.geo.lat, longitude: input.geo.lng }
      : undefined,
  };
}
