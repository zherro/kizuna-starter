import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { isAllowedUf, parseEscopo, parseMeta, type EleicaoMeta } from '../eleicao/normalize';

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

/** Resolve a consulta da API. Arquivo ausente/ilegível → `{status:"aguardando"}`. */
export async function queryEleicao(
  escopo: string | null,
  uf: string | null,
  dir = dataDir()
): Promise<EleicaoQuery> {
  const aguardando = { ok: true as const, body: { status: 'aguardando' } };

  if (escopo === 'meta') {
    const meta = await readMeta(dir);
    return meta ? { ok: true, body: { ...meta } } : aguardando;
  }
  if (escopo === 'nacional') {
    const data = parseEscopo(await readJson(path.join(dir, 'nacional.json')));
    return data ? { ok: true, body: { ...data } } : aguardando;
  }
  if (escopo === 'uf') {
    const meta = await readMeta(dir);
    if (!isAllowedUf(uf, meta?.ufs ?? [])) return { ok: false, error: 'uf_invalida' };
    const data = parseEscopo(await readJson(path.join(dir, 'uf', `${uf}.json`)));
    return data ? { ok: true, body: { ...data } } : aguardando;
  }
  return { ok: false, error: 'escopo_invalido' };
}
