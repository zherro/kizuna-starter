import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * As páginas de anúncio são ISR (`revalidate = 300`): sem isto, salvar no painel só aparece no
 * site depois de até 5 minutos (e a página velha ainda mostra vínculos/fotos antigos). Toda escrita
 * que muda o detalhe invalida as duas rotas de anúncio — por padrão de rota, porque um anúncio
 * aparece também na página de outros (lugar ↔ evento, carrosséis); a próxima visita regenera.
 */
const AD_RESOURCES = new Set(['services', 'service_addresses', 'service_categories_sub']);
const AD_RPCS = new Set(['fn_form_result_upsert']);

/** Tag do `unstable_cache` dos dados do detalhe (`loadAd`) — a página e os dados têm caches separados. */
export const AD_DETAIL_TAG = 'anuncio-detalhe';

function revalidateAdPages() {
  revalidateTag(AD_DETAIL_TAG, { expire: 0 });
  revalidatePath('/anuncios/[uid]', 'page');
  revalidatePath('/[cidade]/anuncio/[uid]', 'page');
}

/** Depois de uma escrita em `/api/resources/<resource>`: invalida se deu certo e afeta anúncio. */
export function revalidateAfterResourceWrite<T extends Response>(resource: string, res: T): T {
  if (res.ok && AD_RESOURCES.has(resource)) revalidateAdPages();
  return res;
}

/** Depois de uma RPC bem-sucedida (ex.: respostas do formulário do anúncio). */
export function revalidateAfterRpc(functionName: string) {
  if (AD_RPCS.has(functionName)) revalidateAdPages();
}
