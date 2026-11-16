// Foco na cidade escolhida, com espaço garantido para as cidades irmãs (`regions`).
//
// Cuiabá, Várzea Grande e Chapada formam uma praça só: as trilhas da home buscam a região inteira.
// Sem regra, quem tem mais conteúdo (Cuiabá) ocupa todos os cards e a irmã nunca aparece; com
// "cidade primeiro" puro, acontece o mesmo na página da cidade maior. Aqui:
// - a cidade escolhida tem preferência (o 1º card é dela, quando ela tem conteúdo);
// - as irmãs têm uma cota mínima (`sisterShare`, ~30% dos cards) quando têm conteúdo;
// - sobra de um lado completa o outro (cidade sem conteúdo = trilha toda das irmãs, e vice-versa);
// - `dedupeTitle`: o mesmo título em duas cidades (filme de cinema) vira um card só, o da cidade
//   escolhida (são as sessões dela); o da irmã só aparece se a cidade escolhida não tiver o título.
// Puro (sem React nem servidor): roda no servidor (HTML) e no navegador (embaralhar a cada visita).

export type CityFocusItem = { city?: string | null; title?: string | null };

export type CityFocusOptions = {
  /** Nome da cidade escolhida (como vem em `ServiceResult.city`). Sem ela, não há foco. */
  cityName?: string | null;
  limit: number;
  /** Fração mínima de cards das irmãs, quando elas têm conteúdo. Padrão 0.3. */
  sisterShare?: number;
  /** Um card por título (normalizado), preferindo o da cidade escolhida. */
  dedupeTitle?: boolean;
  /**
   * "keep": mantém a ordem de entrada entre os escolhidos (ex.: eventos por data).
   * "city": cidade escolhida na frente, irmãs intercaladas a cada 3 cards (cidade, cidade, irmã…).
   */
  arrange?: 'keep' | 'city';
};

export type CityFocusResult<T> = {
  items: T[];
  /** Há mais itens do que os mostrados (card "Ver mais"). */
  hasMore: boolean;
  ownCount: number;
  sisterCount: number;
};

export const DEFAULT_SISTER_SHARE = 0.3;

export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function focusOnCity<T extends CityFocusItem>(
  items: readonly T[],
  { cityName, limit, sisterShare = DEFAULT_SISTER_SHARE, dedupeTitle = false, arrange = 'keep' }: CityFocusOptions
): CityFocusResult<T> {
  const max = Math.max(0, Math.floor(limit));
  const city = normalizeKey(cityName);
  const indexed = items.map((item, index) => ({ item, index, own: city !== '' && normalizeKey(item.city) === city }));

  // dedupe olhando primeiro os da cidade escolhida: o card que fica é o dela
  let pool = indexed;
  if (dedupeTitle) {
    const seen = new Set<string>();
    const keep = new Set<number>();
    for (const entry of [...indexed.filter((e) => e.own), ...indexed.filter((e) => !e.own)]) {
      const key = normalizeKey(entry.item.title);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      keep.add(entry.index);
    }
    pool = indexed.filter((e) => keep.has(e.index));
  }

  if (!city) {
    return { items: pool.slice(0, max).map((e) => e.item), hasMore: pool.length > max, ownCount: 0, sisterCount: 0 };
  }

  const own = pool.filter((e) => e.own);
  const sisters = pool.filter((e) => !e.own);
  // arredondamento comum, com no mínimo 1 vaga quando a irmã tem conteúdo (4 cards → 1; 10 → 3)
  const share = Math.min(Math.max(sisterShare, 0), 1);
  const reserved = share > 0 && max > 1 ? Math.min(sisters.length, Math.max(1, Math.round(max * share))) : 0;
  const ownTake = Math.min(own.length, max - reserved);
  const sisterTake = Math.min(sisters.length, max - ownTake);
  const pickedOwn = own.slice(0, ownTake);
  const pickedSisters = sisters.slice(0, sisterTake);

  let chosen: typeof pool;
  if (arrange === 'keep') {
    chosen = [...pickedOwn, ...pickedSisters].sort((a, b) => a.index - b.index);
  } else {
    chosen = [];
    let o = 0;
    let s = 0;
    while (o < pickedOwn.length || s < pickedSisters.length) {
      const sisterTurn = chosen.length % 3 === 2;
      if ((sisterTurn && s < pickedSisters.length) || o >= pickedOwn.length) chosen.push(pickedSisters[s++]);
      else chosen.push(pickedOwn[o++]);
    }
  }

  return {
    items: chosen.map((e) => e.item),
    hasMore: pool.length > chosen.length,
    ownCount: pickedOwn.length,
    sisterCount: pickedSisters.length,
  };
}

/** Embaralhamento determinístico por texto (ex.: dia + cidade): varia por dia, igual para todos. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
