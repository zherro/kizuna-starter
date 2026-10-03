import {
  parseDeputados,
  parseEscopo,
  parseMeta,
  tseKey,
  type Cargo,
  type EleicaoAguardando,
  type EleicaoDeputados,
  type EleicaoEscopo,
  type EleicaoMeta,
} from './normalize';

// Lógica de consulta do client, sem React (testável): cache por cargo+escopo + decisão de rebaixar.

export type ScopeKey = string; // 'presidente:BR' | 'senador:SP'
export type EleicaoScopeKind = 'nacional' | 'uf';
export type CachedScope = {
  data: EleicaoEscopo | EleicaoAguardando;
  tse: string | null;
  /** Mudança de colocação em relação à leitura anterior (id do candidato → posições). */
  moves?: Record<string, number>;
};

export function scopeKey(cargo: Cargo, escopo: EleicaoScopeKind, uf: string | null): ScopeKey {
  return `${cargo}:${escopo === 'nacional' ? 'BR' : (uf ?? '')}`;
}

export function apiUrl(
  cargo: Cargo,
  escopo: 'meta' | EleicaoScopeKind,
  uf?: string | null
): string {
  const q = new URLSearchParams({ cargo, escopo });
  if (escopo === 'uf' && uf) q.set('uf', uf);
  return `/api/eleicao?${q.toString()}`;
}

/** Foto do candidato; deputados levam cargo/UF para o servidor poder buscar a foto no TSE. */
export function fotoUrl(sqcand: string, cargo?: Cargo | null, uf?: string | null): string {
  const base = `/api/eleicao/foto/${sqcand}`;
  if (cargo && uf && cargo.startsWith('deputado-')) {
    return `${base}?${new URLSearchParams({ cargo, uf }).toString()}`;
  }
  return base;
}

export type DepQueryParams = {
  cargo: Cargo;
  uf: string;
  q?: string;
  partido?: string | null;
  page?: number;
  limit?: number;
  eleitos?: boolean;
};

export function deputadosUrl(p: DepQueryParams): string {
  const q = new URLSearchParams({ cargo: p.cargo, escopo: 'uf', uf: p.uf });
  if (p.q) q.set('q', p.q);
  if (p.partido) q.set('partido', p.partido);
  if (p.page && p.page > 1) q.set('page', String(p.page));
  if (p.limit) q.set('limit', String(p.limit));
  if (p.eleitos) q.set('eleitos', '1');
  return `/api/eleicao?${q.toString()}`;
}

/** Uma fatia (página) de deputados já filtrada no servidor. */
export async function fetchDeputados(
  params: DepQueryParams,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<EleicaoDeputados | EleicaoAguardando> {
  const res = await fetchImpl(deputadosUrl(params), { credentials: 'same-origin', signal });
  if (res.status === 429) throw new CaptchaRequired((await res.json().catch(() => ({}))).captcha !== false);
  if (!res.ok) throw new Error(`http_${res.status}`);
  const data = parseDeputados(await res.json());
  if (!data) throw new Error('formato_invalido');
  return data;
}

/**
 * Só rebaixa o escopo se o TSE publicou algo novo PARA ESSE CARGO (meta.cargos[cargo].tse)
 * ou se ainda não há cache.
 */
export function shouldFetchScope(
  cached: CachedScope | undefined,
  meta: EleicaoMeta | null,
  cargo: Cargo
): boolean {
  if (!cached) return true;
  if (cached.data.status === 'aguardando') return true;
  if (!meta) return true;
  if (meta.status === 'aguardando') return false;
  const current = tseKey(meta.cargos[cargo]?.tse);
  return current === null || current !== cached.tse;
}

export class CaptchaRequired extends Error {
  constructor(public readonly captcha: boolean) {
    super('captcha_required');
  }
}

export async function fetchMeta(fetchImpl: typeof fetch = fetch): Promise<EleicaoMeta | null> {
  const res = await fetchImpl(apiUrl('presidente', 'meta'), { credentials: 'same-origin' });
  if (res.status === 429) throw new CaptchaRequired((await res.json().catch(() => ({}))).captcha !== false);
  if (!res.ok) throw new Error(`http_${res.status}`);
  return parseMeta(await res.json());
}

export async function fetchScope(
  cargo: Cargo,
  escopo: EleicaoScopeKind,
  uf: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<CachedScope> {
  const res = await fetchImpl(apiUrl(cargo, escopo, uf), { credentials: 'same-origin' });
  if (res.status === 429) throw new CaptchaRequired((await res.json().catch(() => ({}))).captcha !== false);
  if (!res.ok) throw new Error(`http_${res.status}`);
  const data = parseEscopo(await res.json());
  if (!data) throw new Error('formato_invalido');
  return { data, tse: data.status === 'ok' ? tseKey(data.tse) : null };
}
