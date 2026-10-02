import { describe, expect, it } from 'vitest';
import {
  clientIp,
  createRateLimiter,
  readCookie,
  signPass,
  verifyPass,
} from '../../src/lib/server/eleicao-rate-limit';

describe('rate limiter', () => {
  it('bloqueia a 6a request em 10s', () => {
    const rl = createRateLimiter(5, 10_000);
    for (let i = 0; i < 5; i++) expect(rl.hit('1.1.1.1', 1000 + i)).toBe(true);
    expect(rl.hit('1.1.1.1', 1500)).toBe(false);
  });

  it('isola por IP', () => {
    const rl = createRateLimiter(1, 10_000);
    expect(rl.hit('a', 0)).toBe(true);
    expect(rl.hit('b', 0)).toBe(true);
    expect(rl.hit('a', 1)).toBe(false);
  });

  it('a janela desliza e libera depois de 10s', () => {
    const rl = createRateLimiter(5, 10_000);
    for (let i = 0; i < 5; i++) rl.hit('ip', 0);
    expect(rl.hit('ip', 9_999)).toBe(false);
    expect(rl.hit('ip', 10_001)).toBe(true);
  });

  it('limpa entradas antigas', () => {
    const rl = createRateLimiter(5, 10_000);
    rl.hit('old', 0);
    rl.hit('new', 20_000);
    expect(rl.size()).toBe(1);
  });
});

describe('cookie assinado', () => {
  const secret = 's3cret';
  it('valida dentro do prazo', () => {
    const v = signPass(secret, 1_000_000_000_000, 300_000);
    expect(verifyPass(v, secret, 1_000_000_100_000)).toBe(true);
  });
  it('expira apos 5 min', () => {
    const v = signPass(secret, 1_000_000_000_000, 300_000);
    expect(verifyPass(v, secret, 1_000_000_300_001)).toBe(false);
  });
  it('rejeita assinatura adulterada, outro segredo e ausente', () => {
    const v = signPass(secret, 1_000_000_000_000, 300_000);
    expect(verifyPass(v, 'outro', 1_000_000_100_000)).toBe(false);
    expect(verifyPass(`9999999999999.${v.split('.')[1]}`, secret, 1_000_000_100_000)).toBe(false);
    expect(verifyPass(undefined, secret)).toBe(false);
    expect(verifyPass(v, null)).toBe(false);
    expect(verifyPass('lixo', secret)).toBe(false);
  });
});

describe('helpers', () => {
  it('clientIp usa o primeiro x-forwarded-for, depois x-real-ip', () => {
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientIp(h({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(clientIp(h({}))).toBe('unknown');
  });
  it('readCookie', () => {
    expect(readCookie('a=1; eleicao_ok=abc.def; b=2', 'eleicao_ok')).toBe('abc.def');
    expect(readCookie(null, 'x')).toBeUndefined();
  });
});
