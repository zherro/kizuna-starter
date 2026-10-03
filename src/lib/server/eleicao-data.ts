import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { queryDeputados } from './eleicao-deputados';
import {
  isAllowedUf,
  isCargo,
  isDeputado,
  isSqcand,
  parseEscopo,
  parseMeta,
  type Cargo,
  type EleicaoMeta,
} from '../eleicao/normalize';

/** Diretório dos JSONs gerados pelo cron (ELEICAO_DATA_PATH; default ./eleicao-cron/data). */
export function dataDir(): string {
  const fromEnv = process.env.ELEICAO_DATA_PATH;
  if (fromEnv) return path.resolve(fromEnv);
  const def = path.resolve(process.cwd(), 'eleicao-cron', 'data');
  // Só em dev: sem cron local, usa as fixtures de exemplo.
  if (process.env.NODE_ENV !== 'production' && !existsSync(def)) {
    return path.resolve(process.cwd(), 'tests', 'fixtures', 'eleicao');
  }
  return def;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function readMeta(dir = dataDir()): Promise<EleicaoMeta | null> {
  return parseMeta(await readJson(path.join(dir, 'meta.json')));
}

export type EleicaoQuery =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Resolve a consulta da API. `cargo` ausente = presidente; cargo fora da allowlist → erro.
 * `nacional` só existe para presidente. Arquivo ausente/ilegível → `{status:"aguardando"}`.
 * Nada vindo do request vira caminho sem passar por allowlist (cargo) ou `meta.cargos[cargo].ufs` (UF).
 */
export async function queryEleicao(
  cargoParam: string | null,
  escopo: string | null,
  uf: string | null,
  dir = dataDir(),
  searchParams: URLSearchParams | null = null
): Promise<EleicaoQuery> {
  const aguardando = { ok: true as const, body: { status: 'aguardando' } };

  const cargoRaw = cargoParam ?? 'presidente';
  if (!isCargo(cargoRaw)) return { ok: false, error: 'cargo_invalido' };
  const cargo: Cargo = cargoRaw;

  if (escopo === 'meta') {
    const meta = await readMeta(dir);
    return meta ? { ok: true, body: { ...meta } } : aguardando;
  }
  if (escopo === 'nacional') {
    if (cargo !== 'presidente') return { ok: false, error: 'escopo_invalido' };
    const data = parseEscopo(await readJson(path.join(dir, cargo, 'BR.json')));
    return data ? { ok: true, body: { ...data } } : aguardando;
  }
  if (escopo === 'uf') {
    const meta = await readMeta(dir);
    if (!isAllowedUf(uf, meta?.cargos[cargo]?.ufs ?? [])) return { ok: false, error: 'uf_invalida' };
    // Deputados: o servidor filtra/pagina o arquivo da UF e devolve só uma fatia.
    if (isDeputado(cargo)) {
      return queryDeputados(cargo, uf, meta?.cargos[cargo]?.ufs ?? [], searchParams, dir);
    }
    const data = parseEscopo(await readJson(path.join(dir, cargo, `${uf}.json`)));
    return data ? { ok: true, body: { ...data } } : aguardando;
  }
  return { ok: false, error: 'escopo_invalido' };
}

/** Foto do candidato (`fotos/{sqcand}.jpeg`). `null` se o id não for só dígitos ou o arquivo faltar. */
export async function readFoto(sqcand: string, dir = dataDir()): Promise<Buffer | null> {
  if (!isSqcand(sqcand)) return null;
  try {
    return await fs.readFile(path.join(dir, 'fotos', `${sqcand}.jpeg`));
  } catch {
    return null;
  }
}

const FOTO_TIMEOUT_MS = 5000;
const FOTO_MAX_BYTES = 1_000_000;
const SEG_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * URL da foto de deputado no TSE: `{base}/{ambiente}/{ciclo}/{eleicao}/fotos/{uf}/{sqcand}.jpeg`.
 * Tudo vem do meta.json do worker (nunca do request, exceto cargo/UF/sqcand, todos validados por
 * allowlist/regex). `null` se algo estiver ausente ou fora do formato esperado.
 */
export function fotoRemoteUrl(
  meta: EleicaoMeta | null,
  cargo: unknown,
  uf: unknown,
  sqcand: string
): string | null {
  if (!meta || !isDeputado(cargo) || !isSqcand(sqcand)) return null;
  const mc = meta.cargos[cargo];
  if (!mc || !isAllowedUf(uf, mc.ufs) || uf === 'ZZ') return null;
  const { base, ambiente } = meta;
  if (!base || !ambiente || !mc.ciclo || !mc.eleicao) return null;
  if (!SEG_RE.test(mc.ciclo) || !SEG_RE.test(mc.eleicao)) return null;
  const amb = ambiente.split('/');
  if (amb.length === 0 || amb.length > 3 || !amb.every((s) => SEG_RE.test(s))) return null;
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password) return null;
  const root = `${origin.origin}${origin.pathname.replace(/\/+$/, '')}`;
  return `${root}/${amb.join('/')}/${mc.ciclo}/${mc.eleicao}/fotos/${(uf as string).toLowerCase()}/${sqcand}.jpeg`;
}

/** Busca a foto no TSE (timeout 5s, sem redirecionar, ≤1MB, só JPEG). Qualquer falha → `null`. */
export async function fetchFotoRemote(
  meta: EleicaoMeta | null,
  cargo: unknown,
  uf: unknown,
  sqcand: string,
  fetchImpl: typeof fetch = fetch
): Promise<Buffer | null> {
  const url = fotoRemoteUrl(meta, cargo, uf, sqcand);
  if (!url) return null;
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(FOTO_TIMEOUT_MS),
      redirect: 'error',
      headers: { Accept: 'image/jpeg' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type && !/^image\/jpe?g/i.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4 || buf.length > FOTO_MAX_BYTES) return null;
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    return buf;
  } catch {
    return null;
  }
}
