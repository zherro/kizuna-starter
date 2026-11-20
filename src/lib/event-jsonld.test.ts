import { describe, it, expect } from 'vitest';
import type { ServiceDetailData } from '@kizuna/core/server';
import { eventDates, eventJsonLd, eventOffers, zoneOffset } from './event-jsonld';

const TZ = 'America/Cuiaba';
const SITE = { name: 'Bora', url: 'https://boracuiaba.com', defaultDescription: '', defaultOgImage: '/og.png' };

describe('eventDates', () => {
  it('usa as sessões (hora local com fuso) e o fim no dia seguinte', () => {
    expect(zoneOffset(TZ, new Date('2026-12-19T12:00:00Z'))).toBe('-04:00');
    expect(eventDates({ sessoes: [{ data: '2026-12-19', hora_inicio: '22:00', hora_fim: '04:00' }] }, null, TZ)).toEqual({
      startDate: '2026-12-19T22:00:00-04:00',
      endDate: '2026-12-20T04:00:00-04:00',
    });
    expect(eventDates({ sessoes: [{ data: '2026-12-21' }, { data: '2026-12-19' }] }, null, TZ)).toEqual({
      startDate: '2026-12-19',
      endDate: '2026-12-21',
    });
  });
  it('cai para data_inicio e depois expires_at (23:59 = dia sem hora)', () => {
    expect(eventDates({ data_inicio: '2026-12-19T22:00' }, null, TZ)).toEqual({ startDate: '2026-12-19T22:00:00-04:00' });
    expect(eventDates(null, '2027-01-31T01:00:00+00:00', TZ)).toEqual({ startDate: '2027-01-30T21:00:00-04:00' });
    expect(eventDates(null, '2026-12-20T03:59:59.999+00:00', TZ)).toEqual({ startDate: '2026-12-19' });
    expect(eventDates(null, null, TZ)).toBeNull();
  });
});

describe('eventOffers', () => {
  it('gratuito, faixa de preços, preço único e nada', () => {
    expect(eventOffers({ gratuito: true }, null, 'u')).toMatchObject({ '@type': 'Offer', price: 0, priceCurrency: 'BRL' });
    expect(eventOffers({ ingressos: [{ valor: 200 }, { valor: 100 }, { valor: 2500 }] }, null, 'u')).toMatchObject({
      '@type': 'AggregateOffer',
      lowPrice: 100,
      highPrice: 2500,
      offerCount: 3,
    });
    expect(eventOffers({ link_ingresso: 'https://t.com/x', ingressos: [{ valor: 50 }] }, null, 'u')).toMatchObject({
      price: 50,
      url: 'https://t.com/x',
    });
    expect(eventOffers({}, 0, 'u')).toBeUndefined();
  });
});

describe('eventJsonLd', () => {
  it('monta Event com local, imagem e organizador reais', () => {
    const data = {
      service: { title: 'Show', description: '<p>Texto</p>', expiresAt: null, priceUnit: 'quote', startingPrice: 0 },
      extraFields: { schema: [], answers: { sessoes: [{ data: '2026-12-19', hora_inicio: '22:00' }], realizador: 'Casa X' } },
      city: { ibge: '5103403', name: 'Cuiabá', state: 'MT', stateName: 'Mato Grosso' },
      venue: { uid: 'v', title: 'Arena', href: '/x', photo: null, address: 'Av. A, 1', cityName: 'Cuiabá' },
      location: null,
    } as unknown as ServiceDetailData;
    const ld = eventJsonLd(SITE, data, { path: '/cuiaba-mt/anuncio/1', photos: ['/f.jpg'], timeZone: TZ });
    expect(ld).toMatchObject({
      '@type': 'Event',
      name: 'Show',
      startDate: '2026-12-19T22:00:00-04:00',
      location: {
        '@type': 'Place',
        name: 'Arena',
        address: { streetAddress: 'Av. A, 1', addressLocality: 'Cuiabá', addressRegion: 'MT' },
      },
      image: ['https://boracuiaba.com/f.jpg'],
      organizer: { '@type': 'Organization', name: 'Casa X' },
    });
    expect(ld?.offers).toBeUndefined();
  });
});
