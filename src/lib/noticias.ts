import { serverFetchResource } from '@kizuna/core/server/postgrest-crud';
import { pgrstRpc } from '@kizuna/core/server/postrest/conn';
import { runServiceSearch, seedFromKey } from '@kizuna/core/server/services/service-search';
import { stripHtml } from '@kizuna/core/lib/helper/text.helper';
import { fileUrl } from '@kizuna/core/client/components/services/service-helpers';
import { serviceHref } from '@kizuna/core/shared/city-routing/city-slug';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';
import {
  parseNewsDate,
  type NewsHighlightItem,
} from '@kizuna/core/client/components/home/news-highlights-format';

/**
 * Notícias da home (bloco `NewsHighlights` do core). Notícia aqui é um anúncio do grupo de
 * categoria `noticias`: o chapéu é a subcategoria (a 1ª, como no card de busca) ou a categoria;
 * a data vem do formulário `noticias` (`answers.data_publicacao`), com `services.created_at` de
 * reserva. Mesma RPC pública da busca e dos carrosséis (`fn_search_services`): só anúncios
 * ativos, `status = 'active'` e não expirados, com o mesmo filtro de cidade.
 *
 * A RPC não ordena por data (ordena por cidade/avaliação/aleatório): por isso traz um pool maior,
 * completa data e resumo e ordena aqui, do mais recente para o mais antigo.
 */

export const NEWS_GROUP_SLUG = 'noticias';
export const DEFAULT_HOME_NEWS_LIMIT = 6;
/** Fuso em que o formulário grava `data_publicacao` (campo `datetime`, sem fuso). */
export const NEWS_TIME_ZONE = 'America/Cuiaba';
const POOL_MIN = 24;
const POOL_MAX = 48;
const SUMMARY_MAX = 220;

type ServiceDetailRow = { uid: string; description?: string | null; createdAt?: string | null };

export type HomeNewsOptions = {
  /** Código IBGE da cidade da página (home de cidade). Sem ele, todas as cidades. */
  cityIbge?: string;
  /** Cidades irmãs (`regions`): a 1ª é a selecionada; o filtro vale para qualquer uma delas. */
  cityIbges?: string[];
  /** Total de notícias: manchete + lista. Default 6 (1 + 5). */
  limit?: number;
  /** "Agora" para descartar notícia com publicação futura (testes). Default `Date.now()`. */
  now?: number;
};

export type HomeNewsData = { items: NewsHighlightItem[]; moreHref: string };

/** Resumo de uma linha: texto puro da descrição, cortado na última palavra inteira. */
export function newsSummary(description: string | null | undefined, max = SUMMARY_MAX): string | undefined {
  const text = stripHtml(description ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** Chapéu: subcategoria > categoria > "Notícias". */
export function newsKicker(result: Pick<ServiceResult, 'subcategory' | 'category'>): string {
  return result.subcategory?.trim() || result.category?.trim() || 'Notícias';
}

/**
 * Junta o resultado da busca com os detalhes (`services`) e as datas do formulário, ordena do mais
 * recente para o mais antigo (sem data vai pro fim, na ordem da busca) e corta em `limit`. A 1ª
 * notícia (manchete) leva a imagem grande; as outras, a miniatura.
 */
export function buildHomeNewsItems(
  results: ServiceResult[],
  details: Map<string, ServiceDetailRow>,
  publishedByUid: Map<string, string | null>,
  options: { limit: number; now: number }
): NewsHighlightItem[] {
  const seen = new Set<string>();
  const rows = results
    .filter((r) => r.uid && r.title?.trim() && !seen.has(r.uid) && seen.add(r.uid))
    .map((r, order) => {
      const detail = details.get(r.uid);
      const date =
        parseNewsDate(publishedByUid.get(r.uid) ?? null, NEWS_TIME_ZONE) ??
        parseNewsDate(detail?.createdAt ?? null, NEWS_TIME_ZONE);
      return { r, order, detail, date };
    })
    // publicação agendada (data no futuro) ainda não aparece
    .filter(({ date }) => !date || date.getTime() <= options.now)
    .sort((a, b) => {
      if (a.date && b.date) return b.date.getTime() - a.date.getTime() || a.order - b.order;
      if (a.date) return -1;
      if (b.date) return 1;
      return a.order - b.order;
    })
    .slice(0, options.limit);

  return rows.map(({ r, detail, date }, index) => ({
    href: serviceHref(r),
    title: r.title.trim(),
    kicker: newsKicker(r),
    summary: newsSummary(detail?.description),
    image: r.cover_file_id ? fileUrl(r.cover_file_id, index === 0 ? 'full' : 'thumb') : null,
    publishedAt: date ? date.toISOString() : null,
  }));
}

/** `data_publicacao` do formulário do anúncio (RPC pública, só anúncio ativo). */
async function fetchPublishedAt(uid: string): Promise<string | null> {
  const response = await pgrstRpc(
    'fn_get_public_service_form_answers',
    { p_service_uid: uid },
    { auth: null, schema: 'public' }
  ).catch(() => null);
  if (!response?.ok) return null;
  const rows = (await response.json().catch(() => null)) as { answers?: Record<string, unknown> }[] | null;
  const value = rows?.[0]?.answers?.data_publicacao;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Link "Ver todas": a busca pelo grupo, com a cidade da página (mesmo formato das trilhas). */
export function homeNewsMoreHref(city?: { state: string; ibge: string; name: string } | null): string {
  const cityQuery = city
    ? `&state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
    : '';
  return `/busca?group=${NEWS_GROUP_SLUG}${cityQuery}`;
}

/**
 * Carrega as notícias mais recentes do grupo `noticias` (server-side, leitura anônima). Erro de
 * rede ou grupo sem notícia → `[]` (o bloco some). O seed da RPC é fixo: a mesma geração de ISR
 * vê sempre o mesmo pool.
 */
export async function loadHomeNews(options: HomeNewsOptions = {}): Promise<NewsHighlightItem[]> {
  const limit =
    options.limit && options.limit > 0 ? Math.floor(options.limit) : DEFAULT_HOME_NEWS_LIMIT;
  const pool = Math.min(POOL_MAX, Math.max(POOL_MIN, limit * 4));
  const cities = options.cityIbges?.length ? options.cityIbges : null;

  const results = await runServiceSearch(
    {
      p_group_category_slug: NEWS_GROUP_SLUG,
      p_page_size: pool,
      p_city_ibge: cities?.[0] ?? options.cityIbge ?? null,
      ...(cities && cities.length > 1 ? { p_city_ibges: cities } : {}),
    },
    seedFromKey(`home-news:${cities?.join(',') ?? options.cityIbge ?? ''}`)
  ).catch(() => [] as ServiceResult[]);
  if (results.length === 0) return [];

  const uids = [...new Set(results.map((r) => r.uid).filter(Boolean))];
  const [detailRows, published] = await Promise.all([
    serverFetchResource<ServiceDetailRow>(
      'services',
      { active: 'true', status: 'active' },
      { auth: null, limit: uids.length, where: { uid: `in.(${uids.join(',')})` } }
    ).catch(() => [] as ServiceDetailRow[]),
    Promise.all(uids.map(async (uid) => [uid, await fetchPublishedAt(uid)] as const)),
  ]);

  return buildHomeNewsItems(
    results,
    new Map(detailRows.map((row) => [row.uid, row])),
    new Map(published),
    { limit, now: options.now ?? Date.now() }
  );
}
