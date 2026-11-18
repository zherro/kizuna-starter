import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  buildReturnUrl,
  isEmailVerifiedInAuthUsers,
  isValidState,
  matchAllowedReturn,
  parseAllowedReturns,
  signAtlasToken,
} from './atlas-sso';

const SECRET = 'a'.repeat(64);
const allowed = parseAllowedReturns(
  ' https://atlas.example.com/api/v1/auth/bora/callback , http://localhost:4000/api/v1/auth/bora/callback '
);

describe('matchAllowedReturn', () => {
  it('aceita só correspondência exata', () => {
    expect(matchAllowedReturn('http://localhost:4000/api/v1/auth/bora/callback', allowed)).toBe(
      'http://localhost:4000/api/v1/auth/bora/callback'
    );
  });
  it('recusa host parecido, prefixo, query extra, userinfo e vazio', () => {
    for (const v of [
      'https://atlas.example.com.evil.com/api/v1/auth/bora/callback',
      'https://atlas.example.com/api/v1/auth/bora/callback/x',
      'https://atlas.example.com/api/v1/auth/bora/callback?a=1',
      'https://atlas.example.com@evil.com/api/v1/auth/bora/callback',
      '//evil.com',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ]) {
      expect(matchAllowedReturn(v as string, allowed)).toBeNull();
    }
  });
  it('sem allowlist nada passa', () => {
    expect(matchAllowedReturn('http://localhost:4000/x', parseAllowedReturns(undefined))).toBeNull();
  });
});

describe('isValidState', () => {
  it('valida formato', () => {
    expect(isValidState('abcDEF0123456789_-xyz')).toBe(true);
    expect(isValidState('curto')).toBe(false);
    expect(isValidState('com espaço 1234567890')).toBe(false);
    expect(isValidState('a'.repeat(200))).toBe(false);
  });
});

describe('signAtlasToken', () => {
  it('emite HS256 com iss/aud/exp 60s/jti único e claims de identidade', () => {
    const now = 1_700_000_000;
    const a = signAtlasToken({ userId: 'u1', email: 'a@b.com', emailVerified: true, name: 'Ana' }, SECRET, now);
    const b = signAtlasToken({ userId: 'u1', email: 'a@b.com', emailVerified: true }, SECRET, now);
    const { header, payload } = jwt.decode(a, { complete: true }) as any;
    expect(header.alg).toBe('HS256');
    expect(payload).toMatchObject({
      sub: 'u1',
      email: 'a@b.com',
      email_verified: true,
      name: 'Ana',
      iss: 'bora',
      aud: 'atlas',
    });
    expect(payload.exp - payload.iat).toBe(60);
    expect((jwt.decode(b) as any).jti).not.toBe(payload.jti);
    expect(() => jwt.verify(a, SECRET, { algorithms: ['HS256'], clockTimestamp: now + 10 })).not.toThrow();
    expect(() => jwt.verify(a, 'b'.repeat(64), { algorithms: ['HS256'] })).toThrow();
  });
  it('email_verified é sempre booleano', () => {
    const t = signAtlasToken({ userId: 'u', email: 'a@b.com', emailVerified: false }, SECRET);
    expect((jwt.decode(t) as any).email_verified).toBe(false);
  });
  it('recusa segredo curto', () => {
    expect(() => signAtlasToken({ userId: 'u', email: 'a@b.com', emailVerified: true }, 'curto')).toThrow();
  });
});

describe('header e nbf', () => {
  it('emite typ JWT e nbf igual a iat', () => {
    const now = 1_700_000_000;
    const t = signAtlasToken({ userId: 'u', email: 'a@b.com', emailVerified: true }, SECRET, now);
    const { header, payload } = jwt.decode(t, { complete: true }) as any;
    expect(header).toMatchObject({ alg: 'HS256', typ: 'JWT' });
    expect(payload.nbf).toBe(now);
  });
});

describe('isEmailVerifiedInAuthUsers (só auth.users vale)', () => {
  const ok = { login: 'Ana@Example.com', email_verified_at: '2026-01-01T00:00:00Z', is_active: true, deleted_at: null };
  it('verdadeiro com email_verified_at preenchido e login igual', () => {
    expect(isEmailVerifiedInAuthUsers(ok, 'ana@example.com')).toBe(true);
  });
  it('conta com user_data.email_verified=true mas email_verified_at nulo => false', () => {
    // A linha de auth.users não carrega user_data; o campo extra é ignorado de propósito.
    const row = { ...ok, email_verified_at: null, email_verified: true };
    expect(isEmailVerifiedInAuthUsers(row, 'ana@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers({ ...ok, email_verified_at: undefined }, 'ana@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers({ ...ok, email_verified_at: '' }, 'ana@example.com')).toBe(false);
  });
  it('recusa lixo, boolean no lugar do instante, login diferente, inativa e excluída', () => {
    expect(isEmailVerifiedInAuthUsers(null, 'ana@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers([], 'ana@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers({ ...ok, email_verified_at: true }, 'ana@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers({ ...ok, email_verified_at: 'nao-e-data' }, 'ana@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers(ok, 'outra@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers({ ...ok, is_active: false }, 'ana@example.com')).toBe(false);
    expect(isEmailVerifiedInAuthUsers({ ...ok, deleted_at: '2026-02-01T00:00:00Z' }, 'ana@example.com')).toBe(false);
  });
});

describe('buildReturnUrl', () => {
  it('anexa token e state', () => {
    const u = new URL(buildReturnUrl('http://localhost:4000/cb', 'T', 'S'));
    expect(u.searchParams.get('token')).toBe('T');
    expect(u.searchParams.get('state')).toBe('S');
    expect(u.origin + u.pathname).toBe('http://localhost:4000/cb');
  });
});
