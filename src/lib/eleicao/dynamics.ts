import type { EleicaoCandidato, EleicaoTotalizacao } from './normalize';

// Regras puras da parte "viva" da página (testáveis, sem React).

/**
 * Cor única da página (amarelo): hierarquia só por intensidade. Destaque (líder, vagas, eleitos)
 * = amarelo cheio; os demais = tom suave (`--el-bar`). Sem cor por candidato nem por partido.
 */
export function toneFor(highlight: boolean): string {
  return highlight ? 'var(--el-accent-strong)' : 'var(--el-bar)';
}

/** Votos em forma compacta para os chips (1,2 mi / 85 mil / 950). */
export function compactVotes(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const fmt = (v: number) => v.toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (n >= 1_000_000) return `${fmt(n / 1_000_000)} mi`;
  if (n >= 10_000) return `${Math.round(n / 1000)} mil`;
  if (n >= 1000) return `${fmt(n / 1000)} mil`;
  return String(Math.round(n));
}

/** Identificador estável de um candidato dentro do escopo (sqcand, senão o seq). */
export function candidateId(c: Pick<EleicaoCandidato, 'seq' | 'sqcand'>): string {
  return c.sqcand || `seq-${c.seq}`;
}

/**
 * Mudanças de colocação entre duas leituras do MESMO escopo.
 * Valor positivo = subiu N posições; negativo = caiu N; ausente = igual ou candidato novo.
 */
export function positionMoves(
  prev: readonly Pick<EleicaoCandidato, 'seq' | 'sqcand'>[],
  next: readonly Pick<EleicaoCandidato, 'seq' | 'sqcand'>[]
): Record<string, number> {
  const before = new Map(prev.map((c, i) => [candidateId(c), i]));
  const moves: Record<string, number> = {};
  next.forEach((c, i) => {
    const was = before.get(candidateId(c));
    if (was !== undefined && was !== i) moves[candidateId(c)] = was - i;
  });
  return moves;
}

/** Diferença entre o 1º e o 2º colocados. `null` com menos de 2 candidatos. */
export function leadGap(
  candidatos: readonly Pick<EleicaoCandidato, 'votos' | 'percentual'>[]
): { votos: number; pp: number } | null {
  if (candidatos.length < 2) return null;
  const [a, b] = candidatos;
  return { votos: a.votos - b.votos, pp: Math.round((a.percentual - b.percentual) * 100) / 100 };
}

export const LIVE_WINDOW_MS = 2 * 60_000;

/** "Ao vivo": dados atualizados há menos de 2 min (ISO inválido/futuro absurdo → não). */
export function isLive(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= -30_000 && age < LIVE_WINDOW_MS;
}

/** Quantos primeiros colocados recebem destaque: as vagas do Senador, 1 nos demais cargos. */
export function highlightCount(cargo: string, vagas: number | null, total: number): number {
  const n = cargo === 'senador' ? (vagas ?? 1) : 1;
  return Math.max(1, Math.min(n, total, 4));
}

const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** Iniciais para o avatar sem foto: primeira letra do primeiro e do último nome. */
export function initials(nome: string): string {
  const words = nome
    .trim()
    .split(/\s+/)
    .filter((w) => w && !PARTICLES.has(w.toLowerCase()));
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export type VoteMixPart = { key: 'validos' | 'brancos' | 'nulos'; votos: number; pct: number };

/**
 * Composição dos votos com base em `votosTotais`: brancos e nulos como vêm; válidos = o resto
 * (inclui anulados), então as três partes fecham em 100%. Sem votosTotais/brancos/nulos → `null`
 * (a barra não aparece). Não usa pValidos/pBrancos/pNulos (bases diferentes).
 */
export function voteMix(
  tot: Pick<EleicaoTotalizacao, 'votosTotais' | 'brancos' | 'nulos'>
): VoteMixPart[] | null {
  const { votosTotais: total, brancos, nulos } = tot;
  if (total === null || brancos === null || nulos === null) return null;
  if (!(total > 0) || brancos < 0 || nulos < 0 || brancos + nulos > total) return null;
  const validos = total - brancos - nulos;
  const pct = (n: number) => (n / total) * 100;
  return [
    { key: 'validos', votos: validos, pct: pct(validos) },
    { key: 'brancos', votos: brancos, pct: pct(brancos) },
    { key: 'nulos', votos: nulos, pct: pct(nulos) },
  ];
}
