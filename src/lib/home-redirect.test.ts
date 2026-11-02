import { describe, expect, it } from 'vitest';
import { citySlug } from '@kizuna/core/shared/city-routing/city-slug';
import cfg from '@/../kizuna.config.json';
import { resolveHomeRedirect } from './home-redirect';

const def = 'cuiaba-mt';

describe('resolveHomeRedirect', () => {
  it('cookie válido vai pra cidade do cookie', () => {
    expect(resolveHomeRedirect({ cookie: 'cuiaba-mt', outsideList: 'default', defaultCitySlug: def })).toBe('/cuiaba-mt');
    expect(resolveHomeRedirect({ cookie: 'varzea-grande-mt', outsideList: 'prompt' })).toBe('/varzea-grande-mt');
  });
  it('cookie reservado ou inválido cai no padrão', () => {
    expect(resolveHomeRedirect({ cookie: 'api', outsideList: 'default', defaultCitySlug: def })).toBe('/cuiaba-mt');
    expect(resolveHomeRedirect({ cookie: '../x', outsideList: 'default', defaultCitySlug: def })).toBe('/cuiaba-mt');
  });
  it('sem cookie + default vai pro padrão', () => {
    expect(resolveHomeRedirect({ outsideList: 'default', defaultCitySlug: def })).toBe('/cuiaba-mt');
  });
  it('sem cookie + prompt não redireciona', () => {
    expect(resolveHomeRedirect({ outsideList: 'prompt', defaultCitySlug: def })).toBeNull();
  });
  it('sem defaultCitySlug não redireciona', () => {
    expect(resolveHomeRedirect({ outsideList: 'default' })).toBeNull();
  });
  it('defaultCitySlug do config bate com o slug da cidade padrão', () => {
    expect((cfg as { location: { defaultCitySlug: string } }).location.defaultCitySlug).toBe(citySlug('Cuiabá', 'MT'));
  });
});
