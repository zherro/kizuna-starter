import { describe, expect, it } from 'vitest';
import { isAdFreeRoute } from './ad-free-routes';

describe('isAdFreeRoute', () => {
  it('telas de autenticação não têm anúncio', () => {
    for (const p of ['/login', '/registre-se', '/esqueci-senha', '/redefinir-senha', '/verificar-email', '/login/', '/redefinir-senha/abc', '/login?next=/painel']) {
      expect(isAdFreeRoute(p)).toBe(true);
    }
  });
  it('demais páginas mantêm os anúncios', () => {
    for (const p of ['/', '/cuiaba-mt', '/busca', '/loginx', '/cuiaba-mt/login', null]) {
      expect(isAdFreeRoute(p)).toBe(false);
    }
  });
});
