import type { MetadataRoute } from 'next';
import { citySlug, serviceHref } from '@kizuna/core/shared/city-routing/city-slug';
import { runServiceSearchStrict } from '@kizuna/core/server/services/service-search';
import { serverFetchResource } from '@kizuna/core/server/postgrest-crud';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';
import { EVERGREEN_GROUPS, isExpiredListing } from '@/lib/seo-index';

type Entry = MetadataRoute.Sitemap[number];

const PAGE_SIZE = 100;
const MAX_PAGES = 100; // teto de 10k anúncios (limite do protocolo é 50k por arquivo)

type DateRow = { uid: string; updated_at?: string | null; updatedAt?: string | null; created_at?: string | null; createdAt?: string | null };

/** Data de modificação de um anúncio (`updated_at`, senão `created_at`); `undefined` se inválida. */
export function adLastModified(row: DateRow | undefined): Date | undefined {
  const raw = row?.updated_at ?? row?.updatedAt ?? row?.created_at ?? row?.createdAt;
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export type AdEntryFilter = {
  /** Slugs (`cuiaba-mt`) das cidades do portal; anúncio de outra cidade fica fora. `null`/ausente = todas. */
  citySlugs?: ReadonlySet<string> | null;
  /** "Agora" para descartar vencido (evento que já passou), salvo grupo perene. Default `Date.now()`. */
  now?: number;
};

/** O anúncio entra no sitemap? Mesma regra do `noindex` do detalhe (`adNoIndexReason`). */
export function isSitemapAd(r: ServiceResult, filter: AdEntryFilter = {}): boolean {
  if (filter.citySlugs) {
    if (!r.city || !r.state || !filter.citySlugs.has(citySlug(r.city, r.state))) return false;
  }
  return !isExpiredListing({ groupSlug: r.category_group_slug ?? null, expiresAt: r.expires_at ?? null }, filter.now);
}

/** Monta as entradas do sitemap: uma por anúncio indexável (sem repetir uid), com `lastModified` quando há. */
export function buildAdEntries(
  url: string,
  rows: ServiceResult[],
  dates: Map<string, Date>,
  filter: AdEntryFilter = {}
): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const r of rows) {
    if (!r.uid || seen.has(r.uid)) continue;
    seen.add(r.uid);
    if (!isSitemapAd(r, filter)) continue;
    out.push({ url: `${url}${serviceHref(r)}`, lastModified: dates.get(r.uid) });
  }
  return out;
}

async function loadDates(uids: string[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (uids.length === 0) return map;
  // Falha aqui não derruba o sitemap: só sai sem `lastmod` nessa página.
  const rows = await serverFetchResource<DateRow>(
    'services',
    { active: 'true', status: 'active' },
    { auth: null, limit: uids.length, where: { uid: `in.(${uids.join(',')})` } }
  ).catch(() => [] as DateRow[]);
  for (const row of rows) {
    const date = adLastModified(row);
    if (date) map.set(row.uid, date);
  }
  return map;
}

/** Busca uma página ordenada de forma estável (mais novos primeiro); se a RPC for antiga e recusar
 * `p_order`/`p_expired_grace`, cai na ordem padrão e sem vencidos. Erro de rede/HTTP lança. */
async function fetchPage(page: number, ordered: boolean): Promise<ServiceResult[]> {
  return runServiceSearchStrict(
    {
      p_page: page,
      p_page_size: PAGE_SIZE,
      // Só grupo perene (notícia) segue no sitemap depois de vencer, por até 1 ano (máximo da RPC). Evento
      // vencido continua no ar, mas fica `noindex` e fora do sitemap (conteúdo raso depois da data).
      ...(ordered ? { p_order: 'created_at:desc', p_expired_grace: Object.fromEntries([...EVERGREEN_GROUPS].map((g) => [g, 365])) } : {}),
    },
    0
  );
}

/**
 * Todos os anúncios ativos e indexáveis (ver `AdEntryFilter`), com o link canônico (cidade na URL) e `lastmod`. Se a busca falhar ou
 * vier vazia, LANÇA: o Next mantém o último sitemap bom em vez de publicar um sem anúncios.
 */
export async function loadAdEntries(url: string, filter: AdEntryFilter = {}): Promise<Entry[]> {
  let ordered = true;
  const rows: ServiceResult[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let batch: ServiceResult[];
    try {
      batch = await fetchPage(page, ordered);
    } catch (error) {
      if (!ordered || page > 0) throw error;
      ordered = false;
      batch = await fetchPage(page, false);
    }
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  if (rows.length === 0) throw new Error('sitemap: nenhum anúncio retornado pela busca');

  const dates = new Map<string, Date>();
  const uids = [...new Set(rows.map((r) => r.uid).filter(Boolean))];
  for (let i = 0; i < uids.length; i += PAGE_SIZE) {
    for (const [uid, date] of await loadDates(uids.slice(i, i + PAGE_SIZE))) dates.set(uid, date);
  }
  return buildAdEntries(url, rows, dates, filter);
}
