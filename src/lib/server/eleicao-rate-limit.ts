import { createHmac, timingSafeEqual } from 'node:crypto';

// Rate limit em memória (janela deslizante) + cookie assinado de liberação para /api/eleicao.
// Módulo isolado e sem dependência de framework, para ser testável.

export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 10_000;
export const PASS_COOKIE_NAME = 'eleicao_ok';
export const PASS_TTL_MS = 5 * 60_000;

export type RateLimiter = {
  /** Registra a tentativa e diz se passou. Tentativas bloqueadas não são contadas. */
  hit(key: string, now?: number): boolean;
  /** Remove chaves sem hits dentro da janela. */
  sweep(now?: number): void;
  size(): number;
};

export function createRateLimiter(
  limit = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS
): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  function sweep(now = Date.now()) {
    lastSweep = now;
    for (const [key, list] of hits) {
      const fresh = list.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }

  return {
    hit(key, now = Date.now()) {
      if (now - lastSweep >= windowMs) sweep(now);
      const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (list.length >= limit) {
        hits.set(key, list);
        return false;
      }
      list.push(now);
      hits.set(key, list);
      return true;
    },
    sweep,
    size: () => hits.size,
  };
}

// Instância compartilhada (sobrevive ao HMR do dev).
const g = globalThis as unknown as { __eleicaoLimiter?: RateLimiter };
export function sharedLimiter(): RateLimiter {
  return (g.__eleicaoLimiter ??= createRateLimiter());
}

/** IP do cliente via x-forwarded-for (primeiro) / x-real-ip. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Segredo do cookie: ELEICAO_COOKIE_SECRET, senão o segredo JWT já usado pelo projeto. */
export function cookieSecret(): string | null {
  return (
    process.env.ELEICAO_COOKIE_SECRET ||
    process.env.PGRST_JWT_SECRET ||
    process.env.JWT_SECRET ||
    null
  );
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`eleicao-pass:${payload}`).digest('base64url');
}

/** Cria o valor do cookie: `<expiraEmMs>.<hmac>`. */
export function signPass(secret: string, now = Date.now(), ttlMs = PASS_TTL_MS): string {
  const exp = String(now + ttlMs);
  return `${exp}.${sign(exp, secret)}`;
}

export function verifyPass(
  value: string | undefined | null,
  secret: string | null,
  now = Date.now()
): boolean {
  if (!value || !secret) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const exp = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!/^\d{10,16}$/.test(exp) || Number(exp) <= now) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(exp, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
