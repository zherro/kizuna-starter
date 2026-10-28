import { describe, expect, it } from 'vitest';
import type { SeoSite } from '@kizuna/core/server';
import { destinationJsonLd, itemListJsonLd, tripJsonLd } from './turismo-seo';

const site = { name: 'Bora', url: 'https://boracuiaba.com', defaultDescription: '', defaultOgImage: '/og.png', locale: 'pt_BR' } as SeoSite;

describe('turismo JSON-LD', () => {
  it('ItemList com posição e URL absoluta', () => {
    const j = itemListJsonLd(site, 'Rotas', [{ name: 'A', path: '/cuiaba-mt/roteiros/a' }]) as any;
    expect(j['@type']).toBe('ItemList');
    expect(j.itemListElement[0]).toMatchObject({ position: 1, url: 'https://boracuiaba.com/cuiaba-mt/roteiros/a' });
  });
  it('TouristTrip lista as paradas; sem paradas não tem itinerário', () => {
    const base = { name: 'R', description: 'd', path: '/cuiaba-mt/roteiros/r' };
    const com = tripJsonLd(site, { ...base, paradas: [{ name: 'P', path: '/cuiaba-mt/lugares/p' }] }) as any;
    expect(com['@type']).toBe('TouristTrip');
    expect(com.itinerary.itemListElement[0].item.url).toBe('https://boracuiaba.com/cuiaba-mt/lugares/p');
    expect((tripJsonLd(site, { ...base, paradas: [] }) as any).itinerary).toBeUndefined();
  });
  it('TouristDestination com geo opcional', () => {
    const j = destinationJsonLd(site, { name: 'Sucuri', description: 'd', path: '/cuiaba-mt/regioes/sucuri', geo: { lat: -15.6, lng: -56.1 } }) as any;
    expect(j['@type']).toBe('TouristDestination');
    expect(j.geo.latitude).toBe(-15.6);
    expect((destinationJsonLd(site, { name: 'x', description: 'd', path: '/x' }) as any).geo).toBeUndefined();
  });
});
