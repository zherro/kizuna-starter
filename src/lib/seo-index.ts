import type { Metadata } from 'next';
import type { ServiceDetailData } from '@kizuna/core/server';
import { citySlug, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { parseRegions } from '@kizuna/core/shared/regions';
import cfg from '@/../kizuna.config.json';

/**
 * Quais páginas o buscador deve indexar. Página rasa (evento que já passou, anúncio de fora da
 * região do portal, listagem vazia, busca com filtro) continua no ar e com links seguidos, só sai
 * do índice (`noindex, follow`) e do sitemap. Tudo derivado do `kizuna.config.json`:
 * - região do portal = cidades de `regions` + `location.defaultCityIbge` (sem nenhuma: todas valem);
 * - `seo.evergreenGroups` = grupos que seguem indexáveis depois de vencer (ex.: notícias).
 */

type SeoConfig = { evergreenGroups?: string[] };
type LocationConfig = { defaultCityIbge?: string };

const seoCfg = ((cfg as { seo?: SeoConfig }).seo ?? {}) as SeoConfig;
const location = (cfg as { location?: LocationConfig }).location;

/** Códigos IBGE da região do portal; vazio = sem restrição de cidade. */
export const PORTAL_CITY_IBGES: ReadonlySet<string> = new Set(
  [
    ...parseRegions((cfg as { regions?: unknown }).regions).flatMap((r) => r.cities),
    ...(location?.defaultCityIbge ? [location.defaultCityIbge] : []),
  ].map(String)
);

/** Grupos que continuam indexáveis depois de `expires_at` (conteúdo perene). */
export const EVERGREEN_GROUPS: ReadonlySet<string> = new Set(seoCfg.evergreenGroups ?? ['noticias']);

export const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/** Mesma metadata, mas fora do índice (links continuam sendo seguidos). */
export function withIndexing(meta: Metadata, indexable: boolean): Metadata {
  return indexable ? meta : { ...meta, robots: NOINDEX_FOLLOW };
}

export function isPortalCityIbge(ibge: string | number | null | undefined): boolean {
  if (PORTAL_CITY_IBGES.size === 0) return true;
  return ibge != null && PORTAL_CITY_IBGES.has(String(ibge));
}

/** Slugs (`cuiaba-mt`) das cidades do portal, a partir da lista de cidades roteáveis. `null` = sem restrição. */
export function portalCitySlugs(cities: RoutableCity[]): Set<string> | null {
  if (PORTAL_CITY_IBGES.size === 0) return null;
  return new Set(cities.filter((c) => isPortalCityIbge(c.ibge)).map((c) => citySlug(c.name, c.state)));
}

type ExpiryInput = {
  groupSlug?: string | null;
  expiresAt?: string | null;
  /** Reserva quando não há `expires_at`: `answers.data_fim`/`data_inicio` (AAAA-MM-DD[THH:MM], hora local). */
  fallbackDate?: string | null;
};

/** Fim do conteúdo em ms: `expires_at` (ISO com fuso); na reserva, o fim do dia da data (UTC-4, fuso do portal). */
function endOf(input: ExpiryInput): number | null {
  const fallbackDay = input.fallbackDate?.slice(0, 10);
  const value = input.expiresAt || (fallbackDay && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDay) ? `${fallbackDay}T23:59:59-04:00` : null);
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Anúncio vencido (evento que já aconteceu, filme fora de cartaz…) e que não é de grupo perene. */
export function isExpiredListing(input: ExpiryInput, now = Date.now()): boolean {
  if (input.groupSlug && EVERGREEN_GROUPS.has(input.groupSlug)) return false;
  const end = endOf(input);
  return end !== null && end < now;
}

const answer = (data: ServiceDetailData, key: string): string | null => {
  const v = data.extraFields?.answers?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

/**
 * Motivo de o detalhe do anúncio ficar fora do índice; `null` = indexável.
 * `addressIbge` = IBGE do endereço principal do anúncio: a cidade da URL (`data.city`) cai na cidade
 * do prestador quando o endereço é de uma cidade que o portal não lista (ex.: evento em Campo Grande
 * publicado por alguém de Cuiabá) — com endereço, vale a cidade dele (a mesma da busca/sitemap).
 */
export function adNoIndexReason(
  data: ServiceDetailData,
  now = Date.now(),
  addressIbge: string | null = null
): 'expired' | 'out-of-region' | null {
  if (!data.city || !isPortalCityIbge(data.city.ibge)) return 'out-of-region';
  if (addressIbge && !isPortalCityIbge(addressIbge)) return 'out-of-region';
  const expired = isExpiredListing(
    {
      groupSlug: data.service.categoryGroup?.slug ?? null,
      expiresAt: data.service.expiresAt ?? null,
      fallbackDate: answer(data, 'data_fim') ?? answer(data, 'data_inicio'),
    },
    now
  );
  return expired ? 'expired' : null;
}

type TurismoCounts = { rotas: unknown[]; dormir: unknown[]; comer: unknown[]; atracoes: unknown[]; regioes: unknown[] };
export type TurismoSection = 'all' | keyof TurismoCounts;

/** Listagens de turismo e a seção que cada uma lista (a entrada `/turismo` mostra todas). */
export const TURISMO_PAGES: readonly { path: string; section: TurismoSection }[] = [
  { path: '/turismo', section: 'all' },
  { path: '/turismo/rotas', section: 'rotas' },
  { path: '/turismo/dormir', section: 'dormir' },
  { path: '/turismo/comer', section: 'comer' },
  { path: '/turismo/o-que-fazer', section: 'atracoes' },
  { path: '/turismo/regioes', section: 'regioes' },
];

/** A listagem de turismo tem item publicado? Vazia ("Volte em breve") fica `noindex` e fora do sitemap. */
export function turismoHasItems(t: TurismoCounts, section: TurismoSection = 'all'): boolean {
  if (section !== 'all') return t[section].length > 0;
  return t.rotas.length + t.dormir.length + t.comer.length + t.atracoes.length + t.regioes.length > 0;
}
