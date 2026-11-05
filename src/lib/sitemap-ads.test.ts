import { describe, it, expect } from 'vitest';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';
import { adLastModified, buildAdEntries } from './sitemap-ads';

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
