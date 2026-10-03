// Contrato dos JSONs do cron da eleição + normalização defensiva (server e client).
// Puro: sem imports de runtime, testável isoladamente.

export type EleicaoTse = { dg: string; hg: string };

export const CARGOS = [
  'presidente',
  'governador',
  'senador',
  'deputado-federal',
  'deputado-estadual',
] as const;
export type Cargo = (typeof CARGOS)[number];

export function isCargo(v: unknown): v is Cargo {
  return typeof v === 'string' && (CARGOS as readonly string[]).includes(v);
}

/** Cargos proporcionais: arquivos grandes, servidos paginados por `/api/eleicao` (só por UF). */
export const DEPUTADO_CARGOS = ['deputado-federal', 'deputado-estadual'] as const;
export type DeputadoCargo = (typeof DEPUTADO_CARGOS)[number];

export function isDeputado(v: unknown): v is DeputadoCargo {
  return typeof v === 'string' && (DEPUTADO_CARGOS as readonly string[]).includes(v);
}

export type EleicaoMetaCargo = {
  /** Id da eleição no TSE (`cd`), usado na URL das fotos. */
  eleicao: string | null;
  ciclo: string | null;
  turno: number | null;
  atualizadoEm: string | null;
  tse: EleicaoTse | null;
  ufs: string[];
};

export type EleicaoMeta = {
  /** TSE_BASE_URL do worker (para o proxy de fotos dos deputados). */
  base: string | null;
  status: 'ok' | 'aguardando';
  atualizadoEm: string | null;
  ambiente: string | null;
  ciclo: string | null;
  ufs: string[];
  cargos: Partial<Record<Cargo, EleicaoMetaCargo>>;
};

export type EleicaoCandidato = {
  seq: number;
  numero: string;
  /** Id da foto em `/api/eleicao/foto/{sqcand}`; vazio quando desconhecido. */
  sqcand: string;
  nome: string;
  partido: string | null;
  votos: number;
  percentual: number;
  situacao: string;
  eleito: boolean;
  /** Coligação/federação (deputados); opcional. */
  coligacao?: string | null;
  /** Colocação no ranking da UF (só nas respostas paginadas de deputado). */
  pos?: number;
};

export const TOTALIZACAO_KEYS = [
  'pctSecoes',
  'votosValidos',
  'brancos',
  'nulos',
  'secoesTotal',
  'secoesTotalizadas',
  'secoesNaoTotalizadas',
  'eleitorado',
  'eleitoradoApurado',
  'pEleitoradoApurado',
  'comparecimento',
  'pComparecimento',
  'abstencoes',
  'pAbstencao',
  'votosTotais',
  'pValidos',
  'pBrancos',
  'pNulos',
] as const;

/** Resumo da apuração; todos os campos são opcionais no arquivo (ausente → `null`). */
export type EleicaoTotalizacao = Record<(typeof TOTALIZACAO_KEYS)[number], number | null>;

export type EleicaoEscopo = {
  status: 'ok';
  cargo: Cargo | null;
  escopo: string;
  turno: number | null;
  tse: EleicaoTse | null;
  totalizacao: EleicaoTotalizacao;
  /** Número de vagas em disputa (Senador); `null` quando não informado. */
  vagas: number | null;
  /** Nome do cargo quando difere do padrão (ex.: "Deputado Distrital" no DF). */
  cargoNome?: string | null;
  candidatos: EleicaoCandidato[];
};

export type PartidoResumo = { sigla: string; votos: number; candidatos: number; eleitos: number };

/** Resposta de `/api/eleicao` para deputados: uma fatia + totais já filtrados no servidor. */
export type EleicaoDeputados = Omit<EleicaoEscopo, 'candidatos'> & {
  total: number;
  page: number;
  pageSize: number;
  partidos: PartidoResumo[];
  candidatos: EleicaoCandidato[];
};

export type EleicaoAguardando = { status: 'aguardando' };

const UF_RE = /^[A-Z]{2}$/;
const SQCAND_RE = /^\d{1,20}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function parseTse(v: unknown): EleicaoTse | null {
  if (!isRecord(v)) return null;
  const dg = str(v.dg);
  const hg = str(v.hg);
  return dg && hg ? { dg, hg } : null;
}

/** Lista de UFs: duas letras maiúsculas. `BR` é escopo nacional, nunca uma UF. */
function parseUfs(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((u): u is string => typeof u === 'string' && UF_RE.test(u) && u !== 'BR')
    : [];
}

/** UF válida: duas letras maiúsculas E presente na lista recebida. Bloqueia path traversal. */
export function isAllowedUf(uf: unknown, ufs: readonly string[]): uf is string {
  return typeof uf === 'string' && UF_RE.test(uf) && uf !== 'BR' && ufs.includes(uf);
}

/** `sqcand` válido: só dígitos (vira nome de arquivo de foto). */
export function isSqcand(v: unknown): v is string {
  return typeof v === 'string' && SQCAND_RE.test(v);
}

function parseMetaCargo(v: unknown): EleicaoMetaCargo | null {
  if (!isRecord(v)) return null;
  return {
    eleicao: str(v.eleicao),
    ciclo: str(v.ciclo),
    turno: num(v.turno),
    atualizadoEm: str(v.atualizadoEm),
    tse: parseTse(v.tse),
    ufs: parseUfs(v.ufs),
  };
}

export function parseMeta(raw: unknown): EleicaoMeta | null {
  if (!isRecord(raw)) return null;
  const cargos: EleicaoMeta['cargos'] = {};
  if (isRecord(raw.cargos)) {
    for (const c of CARGOS) {
      const m = parseMetaCargo(raw.cargos[c]);
      if (m) cargos[c] = m;
    }
  }
  return {
    base: str(raw.base),
    status: raw.status === 'ok' ? 'ok' : 'aguardando',
    atualizadoEm: str(raw.atualizadoEm),
    ambiente: str(raw.ambiente),
    ciclo: str(raw.ciclo),
    ufs: parseUfs(raw.ufs),
    cargos,
  };
}

function parseTotalizacao(t: Record<string, unknown>): EleicaoTotalizacao {
  const out = {} as EleicaoTotalizacao;
  for (const k of TOTALIZACAO_KEYS) out[k] = num(t[k]);
  return out;
}

/** Totalização vazia (todos os campos `null`). */
export function emptyTotalizacao(): EleicaoTotalizacao {
  return parseTotalizacao({});
}

/** Normaliza `{cargo}/{ESCOPO}.json`. Devolve `null` se o formato não for reconhecível. */
export function parseEscopo(raw: unknown): EleicaoEscopo | EleicaoAguardando | null {
  if (!isRecord(raw)) return null;
  if (raw.status === 'aguardando') return { status: 'aguardando' };
  if (!Array.isArray(raw.candidatos)) return null;

  const candidatos: EleicaoCandidato[] = [];
  for (const c of raw.candidatos) {
    if (!isRecord(c)) continue;
    const nome = str(c.nome);
    const votos = num(c.votos);
    if (!nome || votos === null) continue;
    const sq = c.sqcand == null ? '' : String(c.sqcand);
    candidatos.push({
      seq: num(c.seq) ?? candidatos.length + 1,
      numero: c.numero == null ? '' : String(c.numero),
      sqcand: isSqcand(sq) ? sq : '',
      nome,
      partido: str(c.partido),
      votos,
      percentual: num(c.percentual) ?? 0,
      situacao: str(c.situacao) ?? '',
      eleito: c.eleito === true,
      ...(str(c.coligacao) ? { coligacao: str(c.coligacao) } : {}),
      ...(num(c.pos) !== null ? { pos: num(c.pos) as number } : {}),
    });
  }
  candidatos.sort((a, b) => b.votos - a.votos);

  const t = isRecord(raw.totalizacao) ? raw.totalizacao : {};
  const vagas = num(raw.vagas);
  return {
    status: 'ok',
    cargo: isCargo(raw.cargo) ? raw.cargo : null,
    escopo: str(raw.escopo) ?? '',
    turno: num(raw.turno),
    tse: parseTse(raw.tse),
    totalizacao: parseTotalizacao(t),
    vagas: vagas !== null && vagas >= 1 ? Math.floor(vagas) : null,
    ...(str(raw.cargoNome) ? { cargoNome: str(raw.cargoNome) } : {}),
    candidatos,
  };
}

/** Resposta paginada de deputados (`total`, `page`, `partidos`). `null` se não reconhecível. */
export function parseDeputados(raw: unknown): EleicaoDeputados | EleicaoAguardando | null {
  const base = parseEscopo(raw);
  if (!base || base.status !== 'ok') return base as EleicaoAguardando | null;
  if (!isRecord(raw)) return null;
  const partidos: PartidoResumo[] = [];
  if (Array.isArray(raw.partidos)) {
    for (const p of raw.partidos) {
      if (!isRecord(p)) continue;
      const sigla = str(p.sigla);
      if (!sigla) continue;
      partidos.push({
        sigla,
        votos: num(p.votos) ?? 0,
        candidatos: num(p.candidatos) ?? 0,
        eleitos: num(p.eleitos) ?? 0,
      });
    }
  }
  const candidatos = base.candidatos.map((c, i) => ({ ...c, pos: c.pos ?? i + 1 }));
  return {
    ...base,
    total: Math.max(0, Math.floor(num(raw.total) ?? candidatos.length)),
    page: Math.max(1, Math.floor(num(raw.page) ?? 1)),
    pageSize: Math.max(1, Math.floor(num(raw.pageSize) ?? candidatos.length)),
    partidos,
    candidatos,
  };
}

/** Chave estável da versão do TSE; `null` quando desconhecida. */
export function tseKey(tse: EleicaoTse | null | undefined): string | null {
  return tse ? `${tse.dg}|${tse.hg}` : null;
}

const nfVotes = new Intl.NumberFormat('pt-BR');
const nfPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatVotes(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? nfVotes.format(n) : '—';
}

export function formatPct(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${nfPct.format(n)}%` : '—';
}

/** Largura (0–100) da barra de percentual. */
export function barWidth(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}
