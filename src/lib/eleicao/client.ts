import {
  parseEscopo,
  parseMeta,
  tseKey,
  type EleicaoAguardando,
  type EleicaoEscopo,
  type EleicaoMeta,
} from './normalize';

// Lógica de consulta do client, sem React (testável): cache por escopo + decisão de rebaixar.

export type ScopeKey = string; // 'BR' | 'SP'
export type CachedScope = { data: EleicaoEscopo | EleicaoAguardando; tse: string | null };

export function scopeKey(escopo: 'nacional' | 'uf', uf: string | null): ScopeKey {
  return escopo === 'nacional' ? 'BR' : (uf ?? '');
}

export function apiUrl(escopo: 'meta' | 'nacional' | 'uf', uf?: string | null): string {
  const q = new URLSearchParams({ escopo });
  if (escopo === 'uf' && uf) q.set('uf', uf);
  return `/api/eleicao?${q.toString()}`;
}

/** Só rebaixa o escopo se o TSE publicou algo novo (ou se ainda não há cache). */
export function shouldFetchScope(
  cached: CachedScope | undefined,
  meta: EleicaoMeta | null
): boolean {
  if (!cached) return true;
  if (cached.data.status === 'aguardando') return true;
  if (!meta) return true;
  if (meta.status === 'aguardando') return false;
  const current = tseKey(meta.tse);
  return current === null || current !== cached.tse;
}

export class CaptchaRequired extends Error {
  constructor(public readonly captcha: boolean) {
    super('captcha_required');
  }
}

export async function fetchMeta(fetchImpl: typeof fetch = fetch): Promise<EleicaoMeta | null> {
  const res = await fetchImpl(apiUrl('meta'), { credentials: 'same-origin' });
  if (res.status === 429) throw new CaptchaRequired((await res.json().catch(() => ({}))).captcha !== false);
  if (!res.ok) throw new Error(`http_${res.status}`);
  return parseMeta(await res.json());
}

export async function fetchScope(
  escopo: 'nacional' | 'uf',
  uf: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<CachedScope> {
  const res = await fetchImpl(apiUrl(escopo, uf), { credentials: 'same-origin' });
  if (res.status === 429) throw new CaptchaRequired((await res.json().catch(() => ({}))).captcha !== false);
  if (!res.ok) throw new Error(`http_${res.status}`);
  const data = parseEscopo(await res.json());
  if (!data) throw new Error('formato_invalido');
  return { data, tse: data.status === 'ok' ? tseKey(data.tse) : null };
}
