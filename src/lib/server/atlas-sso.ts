import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * "Entrar com Bora Cuiabá" para o Atlas: o Bora emite um token curto (60 s) assinado com um
 * segredo DEDICADO (ATLAS_SSO_SECRET) — nunca o PGRST_JWT_SECRET. Ver docs/integracoes/atlas-sso.md.
 */

export const ATLAS_SSO_ISSUER = 'bora';
export const ATLAS_SSO_AUDIENCE = 'atlas';
export const ATLAS_SSO_TTL_SECONDS = 60;
const MIN_SECRET_LENGTH = 32;

export type AtlasSsoIdentity = {
  userId: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
};

/** `ATLAS_SSO_ALLOWED_RETURNS`: URLs exatas separadas por vírgula (sem curinga). */
export function parseAllowedReturns(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Só devolve o `return` se for IGUAL (string exata) a uma entrada da allowlist.
 * Sem normalização nem prefixo: evita open redirect e tokens indo parar em outro host.
 */
export function matchAllowedReturn(value: string | null | undefined, allowed: string[]): string | null {
  if (!value || typeof value !== 'string') return null;
  if (!allowed.includes(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password || u.hash) return null;
  } catch {
    return null;
  }
  return value;
}

/** `state` opaco emitido pelo Atlas: só caracteres seguros e tamanho limitado. */
export function isValidState(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function getAtlasSsoSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.ATLAS_SSO_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/**
 * Linha de `auth.users` lida no servidor (service_role). É a ÚNICA fonte aceita para
 * `email_verified`: `public.user_data.email_verified` é gravável pelo próprio usuário e
 * `fun_auth__account_facts` o mistura (OR) no resultado, então não serve para o SSO.
 */
export type AuthUserVerificationRow = {
  login?: unknown;
  email_verified_at?: unknown;
  is_active?: unknown;
  deleted_at?: unknown;
};

/**
 * `true` só se a conta está ativa, não excluída, o `login` da linha é o e-mail do token e
 * `email_verified_at` é um instante válido. Qualquer dúvida (linha ausente, nulo, lixo) => false.
 */
export function isEmailVerifiedInAuthUsers(row: unknown, email: string): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as AuthUserVerificationRow;
  if (typeof r.login !== 'string' || r.login.trim().toLowerCase() !== email.trim().toLowerCase()) return false;
  if (r.is_active === false) return false;
  if (r.deleted_at !== null && r.deleted_at !== undefined) return false;
  if (typeof r.email_verified_at !== 'string' || r.email_verified_at.length === 0) return false;
  return Number.isFinite(Date.parse(r.email_verified_at));
}

export function signAtlasToken(identity: AtlasSsoIdentity, secret: string, now = Math.floor(Date.now() / 1000)): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('ATLAS_SSO_SECRET curto demais.');
  return jwt.sign(
    {
      sub: identity.userId,
      email: identity.email,
      email_verified: identity.emailVerified === true,
      ...(identity.name ? { name: identity.name } : {}),
      iat: now,
      nbf: now,
      exp: now + ATLAS_SSO_TTL_SECONDS,
      jti: randomUUID(),
      iss: ATLAS_SSO_ISSUER,
      aud: ATLAS_SSO_AUDIENCE,
    },
    secret,
    { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } }
  );
}

/** Monta `return?token=...&state=...` preservando query já existente no `return`. */
export function buildReturnUrl(returnUrl: string, token: string, state: string): string {
  const u = new URL(returnUrl);
  u.searchParams.set('token', token);
  u.searchParams.set('state', state);
  return u.toString();
}
