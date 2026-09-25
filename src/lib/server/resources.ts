// EXEMPLO — registre aqui os ResourceConfig do seu app.
//
// Este arquivo é a SEMENTE (seed) esperada por `@kizuna/core/server` em
// `postgrest-crud.ts` (`import { postgrestResources, postgrestRpcs } from '@/lib/server/resources'`).
// As rotas gerenciadas `app/api/resources/[resource]/route.ts` + `[id]/route.ts` dependem dele.
//
// Um projeto novo começa apenas com os recursos que já vêm dos plugins do
// kizuna-core (abaixo). Ao criar uma tabela própria, escreva o `ResourceConfig`
// num arquivo de domínio local (`src/lib/server/resource-<dominio>.ts`) e faça o
// spread dele aqui — nunca inline um recurso novo diretamente neste arquivo.
// Veja a skill `criar-recurso`.

import { resourceForms } from '@kizuna/core/client/components/screen-engine/resources/forms';
import { resourceFormResults } from '@kizuna/core/client/components/screen-engine/resources/form-results';
import { PAGES_RESOURCE } from '@kizuna/core/client/components/screen-engine/resources/pages';
import { resourceTaxonomy } from '@kizuna/core/client/components/screen-engine/resources/taxonomy';
import { resourceReviews } from '@kizuna/core/client/components/screen-engine/resources/reviews';
import { resourceServices } from '@kizuna/core/client/components/screen-engine/resources/services';
import { rpcSearch } from '@kizuna/core/client/components/screen-engine/resources/search';
import { rpcSwipe } from '@kizuna/core/client/components/screen-engine/resources/swipe';
import type { ResourceConfig, RpcConfig } from '@kizuna/core/types';

export { parseActive, makeSlug } from '@kizuna/core/types';
export type { ResourceConfig, RpcConfig } from '@kizuna/core/types';

/**
 * Todo recurso PostgREST exposto por `/api/resources/[resource]`. Começa só com
 * os configs de plugin que vêm do kizuna-core; adicione os seus fazendo spread
 * de um arquivo de domínio local.
 */
export const postgrestResources: Record<string, ResourceConfig> = {
  // Plugins do kizuna-core — importados + spread, nunca reescritos aqui.
  ...(resourceForms as Record<string, ResourceConfig>),
  ...(resourceFormResults as Record<string, ResourceConfig>),
  ...(PAGES_RESOURCE as Record<string, ResourceConfig>),
  ...(resourceTaxonomy as Record<string, ResourceConfig>),
  ...(resourceReviews as Record<string, ResourceConfig>),
  ...(resourceServices as Record<string, ResourceConfig>),
  // ...spread aqui os recursos do seu app: ...resourceMeuDominio,
};

/**
 * RPCs PostgREST expostas por `POST /api/resources/[resource]` (quando o body
 * não cabe no CRUD genérico). Body é repassado direto como os args `p_*` da RPC.
 */
export const postgrestRpcs: Record<string, RpcConfig> = {
  // forms plugin — upsert singleton das respostas capturadas (chave composta
  // (domain, reference_id), impossível de expressar pela rota genérica).
  fn_form_result_upsert: { schema: 'public' },
  // reviews plugin — caminhos de escrita (resolução cross-tenant, verificação de
  // dono, auditoria append-only). Só relevantes se o plugin `reviews` estiver ativo.
  fn_review_create: { schema: 'public' },
  fn_review_moderation_request: { schema: 'public' },
  fn_review_moderate: { schema: 'public' },
  // services plugin — moderação do anúncio (insere service_moderations e deriva services.status).
  fn_service_moderate: { schema: 'public' },
  // search plugin — busca pública de serviços (/busca). Só relevante com o plugin `search` ativo.
  ...rpcSearch,
  // swipe plugin — deck de descoberta com swipe (liking/disliking). Público + sessão opcional.
  ...rpcSwipe,
  // messaging plugin — o chat usa rotas bespoke `/api/chat/*` que chamam
  // `fn_msg_*` direto (cursor + delta sync não cabem na rota genérica). Se quiser
  // expô-las aqui: fn_msg_start_conversation / fn_msg_send_message / fn_msg_mark_read
  // / fn_msg_list_conversations, todas { schema: 'public' }.
  // ...adicione aqui as RPCs do seu app: fn_minha_rpc: { schema: 'public' },
};
