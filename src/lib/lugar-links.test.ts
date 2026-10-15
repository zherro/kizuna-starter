import { describe, expect, it } from 'vitest';
import { linkEditorialPlaces, type PlaceLookup } from './lugar-links';

const lookup: PlaceLookup = (slug) =>
  slug === 'casa-de-festas-cuiaba'
    ? { slug, title: 'Casa de Festas Cuiabá', cidade: 'cuiaba-mt', photo: '/lugares/casa/1.jpg', address: 'Rua A, 1' }
    : null;

const venue = { uid: 'u1', title: 'Shopping X', href: '/cuiaba-mt/anuncio/u1', photo: null, address: null, cityName: 'Cuiabá' };

describe('linkEditorialPlaces', () => {
  it('ponto de venda sem anúncio vira link da página editorial, pelo código cru', () => {
    const out = linkEditorialPlaces(
      { extras: { pontos_de_venda: [{ nome: 'casa-de-festas-cuiaba' }, { nome: 'outro' }] } },
      { venue: null, salePoints: [{ label: 'Casa De Festas Cuiaba', venue: null }, { label: 'outro', venue: null }] },
      lookup
    );
    expect(out.salePoints?.[0]).toEqual({
      label: 'Casa de Festas Cuiabá',
      venue: {
        uid: 'lugar:casa-de-festas-cuiaba',
        title: 'Casa de Festas Cuiabá',
        href: '/cuiaba-mt/lugares/casa-de-festas-cuiaba',
        photo: '/lugares/casa/1.jpg',
        address: 'Rua A, 1',
        cityName: null,
      },
    });
    expect(out.salePoints?.[1]).toEqual({ label: 'outro', venue: null });
  });

  it('anúncio já resolvido pelo core tem prioridade', () => {
    const sp = [{ label: 'Shopping X', venue }];
    const out = linkEditorialPlaces(
      { extras: { pontos_de_venda: [{ nome: 'casa-de-festas-cuiaba' }] } },
      { venue, salePoints: sp },
      lookup
    );
    expect(out.salePoints).toEqual(sp);
    expect(out.venue).toBe(venue);
  });

  it('local_ref (código ou nome) sem anúncio cai na página editorial', () => {
    const out = linkEditorialPlaces(
      { extras: { local_ref: 'Casa de Festas Cuiabá' } },
      { venue: null, salePoints: [] },
      lookup
    );
    expect(out.venue?.href).toBe('/cuiaba-mt/lugares/casa-de-festas-cuiaba');
  });

  it('sem nada pra resolver, devolve igual', () => {
    const data = { venue: null, salePoints: undefined };
    expect(linkEditorialPlaces({ extras: {} }, data, lookup)).toEqual(data);
  });
});
