// Trilha da home com impulsionamento: vagas patrocinadas no início, depois o foco na cidade
// (`focusOnCity`) sobre o resto. Puro (servidor e navegador) — testável sem React.
import { pickSponsored, type SponsorCandidate } from '@kizuna/core/shared/marketing/boost-placement';
import { focusOnCity, type CityFocusItem, type CityFocusOptions } from '@/lib/city-focus';

export function shuffled<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Vagas patrocinadas primeiro — fora do foco e do sorteio: a vaga é paga e vem do banco já filtrada pela
 * cidade/categoria da trilha (`fn_search_services` 0014) —, depois o foco na cidade sobre o resto, no
 * `limit` que sobrar. Com `rand`: rodízio entre os candidatos patrocinados (o banco manda `railPool`,
 * aparecem `sponsoredSlots`) e, com `shuffle`, sorteio do resto. Sem `rand`: determinístico (HTML do ISR).
 */
export function arrangeRail<T extends SponsorCandidate & CityFocusItem>(
  pool: readonly T[],
  focus: CityFocusOptions,
  sponsoredSlots: number,
  opts: { shuffle?: boolean; rand?: () => number } = {}
): T[] {
  const { pinned, rest } = pickSponsored(pool, sponsoredSlots, opts.rand);
  const ordered = opts.shuffle && opts.rand ? shuffled(rest, opts.rand) : rest;
  const room = Math.max(0, Math.floor(focus.limit) - pinned.length);
  return [...pinned, ...focusOnCity(ordered, { ...focus, limit: room }).items];
}
