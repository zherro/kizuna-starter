import type { MetadataRoute } from 'next';
import { serviceHref } from '@kizuna/core/shared/city-routing/city-slug';
import { runServiceSearchStrict } from '@kizuna/core/server/services/service-search';
import { serverFetchResource } from '@kizuna/core/server/postgrest-crud';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';

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

/** Monta as entradas do sitemap: uma por anúncio (sem repetir uid), com `lastModified` quando há. */
export function buildAdEntries(url: string, rows: ServiceResult[], dates: Map<string, Date>): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const r of rows) {
    if (!r.uid || seen.has(r.uid)) continue;
    seen.add(r.uid);
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
 * `p_order`, cai na ordem padrão. Erro de rede/HTTP lança. */
async function fetchPage(page: number, ordered: boolean): Promise<ServiceResult[]> {
  return runServiceSearchStrict(
    { p_page: page, p_page_size: PAGE_SIZE, ...(ordered ? { p_order: 'created_at:desc' } : {}) },
    0
  );
}

/**
 * Todos os anúncios ativos, com o link canônico (cidade na URL) e `lastmod`. Se a busca falhar ou
 * vier vazia, LANÇA: o Next mantém o último sitemap bom em vez de publicar um sem anúncios.
 */
export async function loadAdEntries(url: string): Promise<Entry[]> {
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
  return buildAdEntries(url, rows, dates);
}
