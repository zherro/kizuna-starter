import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  isAllowedUf,
  isDeputado,
  parseEscopo,
  type DeputadoCargo,
  type EleicaoCandidato,
  type EleicaoEscopo,
  type PartidoResumo,
} from '../eleicao/normalize';

// Deputados (federal/estadual): arquivos de ~600KB por UF. O servidor lê, filtra e devolve só
// uma fatia; o arquivo parseado fica em memória e só é relido quando o mtime/tamanho muda.

export const DEP_DEFAULT_LIMIT = 30;
export const DEP_MAX_LIMIT = 50;
export const DEP_MAX_Q = 60;
const PARTIDO_RE = /^[A-Za-z0-9 ./-]{1,20}$/;
const INT_RE = /^\d{1,6}$/;

export type DepParams = {
  q: string;
  partido: string | null;
  page: number;
  limit: number;
  eleitos: boolean;
};

export type DepParamsResult = { ok: true; params: DepParams } | { ok: false; error: string };

/** Valida page/limit/q/partido/eleitos. Limite acima do máximo é reduzido; o resto inválido → erro. */
export function parseDepParams(sp: URLSearchParams | null): DepParamsResult {
  const get = (k: string) => sp?.get(k) ?? null;

  const pageRaw = get('page');
  if (pageRaw !== null && (!INT_RE.test(pageRaw) || Number(pageRaw) < 1)) {
    return { ok: false, error: 'page_invalida' };
  }
  const limitRaw = get('limit');
  if (limitRaw !== null && (!INT_RE.test(limitRaw) || Number(limitRaw) < 1)) {
    return { ok: false, error: 'limit_invalido' };
  }
  const q = (get('q') ?? '').trim();
  if (q.length > DEP_MAX_Q) return { ok: false, error: 'q_invalido' };
  const partidoRaw = get('partido');
  if (partidoRaw !== null && partidoRaw !== '' && !PARTIDO_RE.test(partidoRaw)) {
    return { ok: false, error: 'partido_invalido' };
  }
  const eleitosRaw = get('eleitos');
  return {
    ok: true,
    params: {
      q,
      partido: partidoRaw ? partidoRaw.trim() : null,
      page: pageRaw === null ? 1 : Number(pageRaw),
      limit: Math.min(DEP_MAX_LIMIT, limitRaw === null ? DEP_DEFAULT_LIMIT : Number(limitRaw)),
      eleitos: eleitosRaw === '1' || eleitosRaw === 'true',
    },
  };
}

/** Minúsculas sem acento (para busca). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export type DepEntry = {
  mtimeMs: number;
  size: number;
  escopo: EleicaoEscopo;
  /** "nome número partido" já sem acento, alinhado a `escopo.candidatos`. */
  haystack: string[];
  siglas: string[];
  eleitoIdx: Set<number>;
  partidos: PartidoResumo[];
};

const g = globalThis as unknown as { __eleicaoDepCache?: Map<string, DepEntry> };
const cache = (): Map<string, DepEntry> => (g.__eleicaoDepCache ??= new Map());
/** Contadores só para teste/observabilidade. */
export const depStats = { parses: 0, hits: 0 };
export function resetDepCache() {
  cache().clear();
  depStats.parses = 0;
  depStats.hits = 0;
}

export function buildEntry(escopo: EleicaoEscopo, mtimeMs = 0, size = 0): DepEntry {
  const cands = escopo.candidatos;
  let eleitoIdx = new Set<number>();
  cands.forEach((c, i) => {
    if (c.eleito) eleitoIdx.add(i);
  });
  if (eleitoIdx.size === 0 && escopo.vagas) {
    eleitoIdx = new Set(Array.from({ length: Math.min(escopo.vagas, cands.length) }, (_, i) => i));
  }
  const byParty = new Map<string, PartidoResumo>();
  const siglas = cands.map((c) => c.partido ?? '—');
  cands.forEach((c, i) => {
    const sigla = siglas[i];
    const p = byParty.get(sigla) ?? { sigla, votos: 0, candidatos: 0, eleitos: 0 };
    p.votos += c.votos;
    p.candidatos += 1;
    if (eleitoIdx.has(i)) p.eleitos += 1;
    byParty.set(sigla, p);
  });
  return {
    mtimeMs,
    size,
    escopo,
    haystack: cands.map((c) => fold(`${c.nome} ${c.numero} ${c.partido ?? ''}`)),
    siglas,
    eleitoIdx,
    partidos: [...byParty.values()].sort((a, b) => b.votos - a.votos || a.sigla.localeCompare(b.sigla)),
  };
}

/** Arquivo parseado de `{cargo}/{UF}.json` (cache por mtime). `null` se ausente/ilegível. */
async function load(dir: string, cargo: DeputadoCargo, uf: string): Promise<DepEntry | null> {
  const file = path.join(dir, cargo, `${uf}.json`);
  const key = `${dir}|${cargo}/${uf}`;
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    cache().delete(key);
    return null;
  }
  const hit = cache().get(key);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    depStats.hits += 1;
    return hit;
  }
  try {
    const parsed = parseEscopo(JSON.parse(await fs.readFile(file, 'utf8')));
    if (!parsed || parsed.status !== 'ok') return null;
    depStats.parses += 1;
    const entry = buildEntry(parsed, st.mtimeMs, st.size);
    cache().set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export type DepQuery = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/** Filtra/pagina um escopo de deputado já carregado. Exportado para teste. */
export function sliceDeputados(entry: DepEntry, p: DepParams): Record<string, unknown> {
  const { escopo } = entry;
  const tokens = fold(p.q).split(/\s+/).filter(Boolean);
  const sigla = p.partido ? fold(p.partido) : null;
  const matches: number[] = [];
  for (let i = 0; i < escopo.candidatos.length; i++) {
    if (p.eleitos && !entry.eleitoIdx.has(i)) continue;
    if (sigla && fold(entry.siglas[i]) !== sigla) continue;
    if (tokens.length && !tokens.every((t) => entry.haystack[i].includes(t))) continue;
    matches.push(i);
  }
  const start = (p.page - 1) * p.limit;
  const candidatos: EleicaoCandidato[] = matches
    .slice(start, start + p.limit)
    .map((i) => ({ ...escopo.candidatos[i], pos: i + 1 }));
  return {
    status: 'ok',
    cargo: escopo.cargo,
    escopo: escopo.escopo,
    turno: escopo.turno,
    tse: escopo.tse,
    totalizacao: escopo.totalizacao,
    vagas: escopo.vagas,
    ...(escopo.cargoNome ? { cargoNome: escopo.cargoNome } : {}),
    total: matches.length,
    page: p.page,
    pageSize: p.limit,
    partidos: entry.partidos,
    candidatos,
  };
}

/** Consulta de deputado por UF. `ufs` = lista de UFs do cargo no meta (allowlist). */
export async function queryDeputados(
  cargo: DeputadoCargo,
  uf: string | null,
  ufs: readonly string[],
  sp: URLSearchParams | null,
  dir: string
): Promise<DepQuery> {
  if (!isDeputado(cargo)) return { ok: false, error: 'cargo_invalido' };
  if (!isAllowedUf(uf, ufs) || uf === 'ZZ') return { ok: false, error: 'uf_invalida' };
  const parsed = parseDepParams(sp);
  if (!parsed.ok) return parsed;
  const entry = await load(dir, cargo, uf);
  if (!entry) return { ok: true, body: { status: 'aguardando' } };
  return { ok: true, body: sliceDeputados(entry, parsed.params) };
}
