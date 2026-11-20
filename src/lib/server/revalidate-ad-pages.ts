import { revalidatePath, revalidateTag } from 'next/cache';
import { BROWSE_RAILS_TAG, PUBLIC_LISTS_TAG } from '@kizuna/core/server';

/**
 * As páginas de anúncio são ISR (`revalidate = 300`): sem isto, salvar no painel só aparece no
 * site depois de até 5 minutos (e a página velha ainda mostra vínculos/fotos antigos). Toda escrita
 * que muda o detalhe invalida as duas rotas de anúncio — por padrão de rota, porque um anúncio
 * aparece também na página de outros (lugar ↔ evento, carrosséis); a próxima visita regenera.
 */
const AD_RESOURCES = new Set(['services', 'service_addresses', 'service_categories_sub']);
const AD_RPCS = new Set(['fn_form_result_upsert', 'fn_service_moderate']);
/** Impulsionamento criado/parado (plugin marketing): muda as vagas patrocinadas das listas públicas. */
const BOOST_RESOURCES = new Set(['boosts']);

/** Tag do `unstable_cache` dos dados do detalhe (`loadAd`) — a página e os dados têm caches separados. */
export const AD_DETAIL_TAG = 'anuncio-detalhe';

function revalidateAdPages() {
  revalidateTag(AD_DETAIL_TAG, { expire: 0 });
  revalidatePath('/anuncios/[uid]', 'page');
  revalidatePath('/[cidade]/anuncio/[uid]', 'page');
  // Vitrine da /busca (trilhas renderizadas no servidor): `loadBrowseRails` + a casca ISR.
  revalidateTag('services', { expire: 0 });
  revalidateTag(BROWSE_RAILS_TAG, { expire: 0 });
  // Listagens públicas em cache no servidor (taxonomia e estatísticas do carrossel de categorias):
  // contagens por categoria mudam com os anúncios.
  revalidateTag(PUBLIC_LISTS_TAG, { expire: 0 });
  revalidatePath('/busca');
}

/**
 * Impulsionamento entrou/saiu do ar: as listas públicas (que escolhem as vagas patrocinadas no banco,
 * `fn_search_services` 0014) estão em cache — trilhas da home (dados 5 min + página 15 min), Hoje,
 * vitrine da /busca e "Também pode te interessar" no detalhe. Invalida só esses caches; a próxima
 * visita de cada página regenera (uma vez), sem custo para quem não usa marketing. Chame também de
 * quem cria o boost fora de `/api/resources` (ex.: liquidação do pagamento).
 */
export function revalidateBoostSurfaces() {
  try {
    revalidateTag('category-rail', { expire: 0 });
    revalidateTag('today-feed', { expire: 0 });
    revalidateTag(BROWSE_RAILS_TAG, { expire: 0 });
    revalidateTag(AD_DETAIL_TAG, { expire: 0 });
    revalidatePath('/[cidade]', 'page');
    revalidatePath('/[cidade]/hoje', 'page');
    revalidatePath('/hoje');
    revalidatePath('/busca');
  } catch {
    // fora de um contexto de requisição do Next (testes/scripts): nada a invalidar
  }
}

/** Depois de uma escrita em `/api/resources/<resource>`: invalida se deu certo e afeta anúncio. */
export function revalidateAfterResourceWrite<T extends Response>(resource: string, res: T): T {
  if (res.ok && AD_RESOURCES.has(resource)) revalidateAdPages();
  if (res.ok && BOOST_RESOURCES.has(resource)) revalidateBoostSurfaces();
  return res;
}

/** Depois de uma RPC bem-sucedida (ex.: respostas do formulário do anúncio). */
export function revalidateAfterRpc(functionName: string) {
  if (AD_RPCS.has(functionName)) revalidateAdPages();
}
