import { describe, it, expect } from 'vitest';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';
import { adLastModified, buildAdEntries, isSitemapAd } from './sitemap-ads';

describe('isSitemapAd', () => {
  const NOW = new Date('2026-11-20T15:00:00Z').getTime();
  const slugs = new Set(['cuiaba-mt', 'varzea-grande-mt', 'chapada-dos-guimaraes-mt']);
  const r = (o: Partial<ServiceResult>) => ({ uid: 'u', city: 'Cuiabá', state: 'MT', ...o }) as ServiceResult;
  it('tira cidade fora da região e evento vencido; mantém notícia vencida', () => {
    expect(isSitemapAd(r({}), { citySlugs: slugs, now: NOW })).toBe(true);
    expect(isSitemapAd(r({ city: 'Campo Grande', state: 'MS' }), { citySlugs: slugs, now: NOW })).toBe(false);
    expect(isSitemapAd(r({ city: 'Cuiabá', state: 'MA' }), { citySlugs: slugs, now: NOW })).toBe(false);
    expect(isSitemapAd(r({ category_group_slug: 'eventos', expires_at: '2026-11-01T00:00:00Z' }), { now: NOW })).toBe(false);
    expect(isSitemapAd(r({ category_group_slug: 'noticias', expires_at: '2026-11-01T00:00:00Z' }), { now: NOW })).toBe(true);
  });
  it('buildAdEntries aplica o filtro', () => {
    const rows = [r({ uid: 'a' }), r({ uid: 'b', city: 'Sinop' })];
    const out = buildAdEntries('https://x.com', rows, new Map(), { citySlugs: slugs, now: NOW });
    expect(out.map((e) => e.url)).toEqual(['https://x.com/cuiaba-mt/anuncio/a']);
  });
});

const row = (uid: string, city = 'Cuiabá', state = 'MT') => ({ uid, city, state }) as ServiceResult;

describe('adLastModified', () => {
  it('prefere updated_at e cai para created_at', () => {
    expect(adLastModified({ uid: 'a', updated_at: '2026-10-02T10:00:00Z', created_at: '2026-10-01T10:00:00Z' })?.toISOString()).toBe(
      '2026-10-02T10:00:00.000Z'
    );
    expect(adLastModified({ uid: 'a', created_at: '2026-10-01T10:00:00Z' })?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });
  it('ignora data ausente ou inválida', () => {
    expect(adLastModified(undefined)).toBeUndefined();
    expect(adLastModified({ uid: 'a', updated_at: 'xx' })).toBeUndefined();
  });
});

describe('buildAdEntries', () => {
  it('não repete uid e leva lastModified', () => {
    const d = new Date('2026-10-02T10:00:00Z');
    const out = buildAdEntries('https://x.com', [row('u1'), row('u1'), row('u2')], new Map([['u1', d]]));
    expect(out).toHaveLength(2);
    expect(out[0].lastModified).toBe(d);
    expect(out[0].url).toContain('https://x.com/');
    expect(out[0].url).toContain('/anuncio/u1');
    expect(out[1].lastModified).toBeUndefined();
  });
});
