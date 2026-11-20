import { describe, it, expect } from 'vitest';
import { buildHostRedirectConfig, hostRedirectTarget } from './host-redirect';

const cfg = buildHostRedirectConfig(
  'https://boracuiaba.com',
  ['boracuiaba.com.br', 'www.boracuiaba.com.br', 'www.boracuiaba.com'],
  ['/ads.txt', '/robots.txt'],
  undefined
);

describe('hostRedirectTarget', () => {
  it('leva .com.br e www para o canônico mantendo caminho e query', () => {
    expect(hostRedirectTarget(cfg, 'boracuiaba.com.br', '/cuiaba-mt/anuncio/x', '?a=1&b=2')).toBe(
      'https://boracuiaba.com/cuiaba-mt/anuncio/x?a=1&b=2'
    );
    expect(hostRedirectTarget(cfg, 'WWW.boracuiaba.com.br:443', '/', '')).toBe('https://boracuiaba.com/');
    expect(hostRedirectTarget(cfg, 'www.boracuiaba.com', '/sobre', '')).toBe('https://boracuiaba.com/sobre');
  });
  it('mantém ads.txt e robots.txt nos dois domínios', () => {
    expect(hostRedirectTarget(cfg, 'boracuiaba.com.br', '/ads.txt', '')).toBeNull();
    expect(hostRedirectTarget(cfg, 'boracuiaba.com.br', '/robots.txt', '')).toBeNull();
  });
  it('não mexe no canônico, localhost nem host desconhecido', () => {
    expect(hostRedirectTarget(cfg, 'boracuiaba.com', '/x', '')).toBeNull();
    expect(hostRedirectTarget(cfg, 'localhost:3010', '/x', '')).toBeNull();
    expect(hostRedirectTarget(cfg, '10.0.1.5:3000', '/x', '')).toBeNull();
    expect(hostRedirectTarget(cfg, null, '/x', '')).toBeNull();
  });
  it('desliga por env ou sem hosts', () => {
    expect(buildHostRedirectConfig('https://boracuiaba.com', ['boracuiaba.com.br'], [], 'off')).toBeNull();
    expect(buildHostRedirectConfig('https://boracuiaba.com', [], [], undefined)).toBeNull();
    expect(buildHostRedirectConfig('https://boracuiaba.com', ['boracuiaba.com'], [], undefined)).toBeNull();
  });
});
