import { describe, it, expect } from 'vitest';
import type { ServiceDetailData } from '@kizuna/core/server';
import { adNoIndexReason, isExpiredListing, isPortalCityIbge, turismoHasItems, withIndexing } from './seo-index';

const NOW = new Date('2026-11-20T15:00:00Z').getTime();
const ad = (over: { ibge?: string | null; group?: string; expiresAt?: string | null; answers?: Record<string, unknown> }) =>
  ({
    service: { expiresAt: over.expiresAt ?? null, categoryGroup: over.group ? { slug: over.group } : undefined },
    city: over.ibge === null ? null : { ibge: over.ibge ?? '5103403', name: 'Cuiabá', state: 'MT', stateName: 'Mato Grosso' },
    extraFields: over.answers ? { schema: [], answers: over.answers } : null,
  }) as unknown as ServiceDetailData;

describe('isPortalCityIbge', () => {
  it('aceita Cuiabá e as cidades irmãs e recusa as demais', () => {
    expect(isPortalCityIbge('5103403')).toBe(true);
    expect(isPortalCityIbge('5108402')).toBe(true);
    expect(isPortalCityIbge('5103007')).toBe(true);
    expect(isPortalCityIbge('5002704')).toBe(false); // Campo Grande
    expect(isPortalCityIbge(null)).toBe(false);
  });
});

describe('isExpiredListing', () => {
  it('evento que já passou vence; notícia (perene) não', () => {
    expect(isExpiredListing({ groupSlug: 'eventos', expiresAt: '2026-11-19T03:59:59Z' }, NOW)).toBe(true);
    expect(isExpiredListing({ groupSlug: 'eventos', expiresAt: '2026-12-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isExpiredListing({ groupSlug: 'noticias', expiresAt: '2026-01-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isExpiredListing({ groupSlug: 'lugares', expiresAt: null }, NOW)).toBe(false);
  });
  it('sem expires_at usa a data do formulário até o fim do dia', () => {
    expect(isExpiredListing({ fallbackDate: '2026-11-20T10:00' }, NOW)).toBe(false);
    expect(isExpiredListing({ fallbackDate: '2026-11-19' }, NOW)).toBe(true);
  });
});

describe('adNoIndexReason', () => {
  it('indexa anúncio vigente da região', () => {
    expect(adNoIndexReason(ad({ group: 'eventos', expiresAt: '2026-12-20T03:59:59Z' }), NOW)).toBeNull();
  });
  it('fora da região ou sem cidade', () => {
    expect(adNoIndexReason(ad({ ibge: '5107909' }), NOW)).toBe('out-of-region');
    expect(adNoIndexReason(ad({ ibge: null }), NOW)).toBe('out-of-region');
  });
  it('endereço fora da região vence a cidade da URL (que caiu na do prestador)', () => {
    expect(adNoIndexReason(ad({}), NOW, '5002704')).toBe('out-of-region');
    expect(adNoIndexReason(ad({}), NOW, '5108402')).toBeNull();
  });
  it('evento vencido, inclusive pela data do formulário', () => {
    expect(adNoIndexReason(ad({ group: 'eventos', expiresAt: '2026-11-01T00:00:00Z' }), NOW)).toBe('expired');
    expect(adNoIndexReason(ad({ group: 'eventos', answers: { data_inicio: '2026-11-10T20:00' } }), NOW)).toBe('expired');
  });
});

describe('withIndexing / turismoHasItems', () => {
  it('noindex mantém follow', () => {
    expect(withIndexing({ title: 'x' }, false).robots).toEqual({ index: false, follow: true });
    expect(withIndexing({ title: 'x' }, true).robots).toBeUndefined();
  });
  it('listagem vazia', () => {
    const empty = { rotas: [], dormir: [], comer: [], atracoes: [], regioes: [] };
    expect(turismoHasItems(empty)).toBe(false);
    expect(turismoHasItems({ ...empty, comer: [1] })).toBe(true);
    expect(turismoHasItems({ ...empty, comer: [1] }, 'dormir')).toBe(false);
  });
});
