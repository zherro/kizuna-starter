// Contrato dos JSONs do cron da eleição + normalização defensiva (server e client).
// Puro: sem imports de runtime, testável isoladamente.

export type EleicaoTse = { dg: string; hg: string };

export type EleicaoMeta = {
  status: 'ok' | 'aguardando';
  atualizadoEm: string | null;
  tse: EleicaoTse | null;
  turno: number | null;
  eleicao: string | null;
  ambiente: string | null;
  ufs: string[];
};

export type EleicaoCandidato = {
  seq: number;
  numero: string;
  nome: string;
  partido: string | null;
  votos: number;
  percentual: number;
  situacao: string;
  eleito: boolean;
};

export type EleicaoTotalizacao = {
  pctSecoes: number | null;
  votosValidos: number | null;
  brancos: number | null;
  nulos: number | null;
};

export type EleicaoEscopo = {
  status: 'ok';
  escopo: string;
  turno: number | null;
  tse: EleicaoTse | null;
  totalizacao: EleicaoTotalizacao;
  candidatos: EleicaoCandidato[];
};

export type EleicaoAguardando = { status: 'aguardando' };

const UF_RE = /^[A-Z]{2}$/;

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

/** UF válida: duas letras maiúsculas E presente na lista de `meta.ufs`. Bloqueia path traversal. */
export function isAllowedUf(uf: unknown, ufs: readonly string[]): uf is string {
  return typeof uf === 'string' && UF_RE.test(uf) && ufs.includes(uf);
}

export function parseMeta(raw: unknown): EleicaoMeta | null {
  if (!isRecord(raw)) return null;
  const ufs = Array.isArray(raw.ufs)
    ? raw.ufs.filter((u): u is string => typeof u === 'string' && UF_RE.test(u))
    : [];
  return {
    status: raw.status === 'ok' ? 'ok' : 'aguardando',
    atualizadoEm: str(raw.atualizadoEm),
    tse: parseTse(raw.tse),
    turno: num(raw.turno),
    eleicao: str(raw.eleicao),
    ambiente: str(raw.ambiente),
    ufs,
  };
}

/** Normaliza nacional.json / uf/XX.json. Devolve `null` se o formato não for reconhecível. */
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
    candidatos.push({
      seq: num(c.seq) ?? candidatos.length + 1,
      numero: c.numero == null ? '' : String(c.numero),
      nome,
      partido: str(c.partido),
      votos,
      percentual: num(c.percentual) ?? 0,
      situacao: str(c.situacao) ?? '',
      eleito: c.eleito === true,
    });
  }
  candidatos.sort((a, b) => b.votos - a.votos);

  const t = isRecord(raw.totalizacao) ? raw.totalizacao : {};
  return {
    status: 'ok',
    escopo: str(raw.escopo) ?? '',
    turno: num(raw.turno),
    tse: parseTse(raw.tse),
    totalizacao: {
      pctSecoes: num(t.pctSecoes),
      votosValidos: num(t.votosValidos),
      brancos: num(t.brancos),
      nulos: num(t.nulos),
    },
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
