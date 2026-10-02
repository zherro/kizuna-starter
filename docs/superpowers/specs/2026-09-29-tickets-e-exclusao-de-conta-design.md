# Tickets + exclusão/recriação de conta — design

Data: 2026-09-29. Escopo: kizuna-core (core `sql/`, `src/server`, plugin novo `tickets`) + starter
(ativação, menu, env).

## Objetivo

1. O usuário pode **excluir a própria conta** e depois **recriá-la com o mesmo e-mail/login**.
2. Quando uma conta é recriada, o sistema **abre um ticket** para o root.
3. Um **plugin `tickets`** genérico: o usuário abre chamados e comenta; o root/admin trabalha a fila.

## Restrições (decididas)

- **Nenhuma função nem view nova no banco.** Só tabelas, colunas, índices, RLS e GRANTs. Funções
  que já existem podem ser *usadas* (`auth.fun_auth_has_perm`, `auth.fun_auth_user_id`,
  `auth.fun_notify`).
- Operações privilegiadas rodam em TypeScript no servidor com um **token de serviço**.
- Telas via `/api/resources` + `ResourceConfig`/`ScreenConfig` (padrão do core); componente sob
  medida só onde config não expressa (thread de comentários, exclusão de conta).
- SOLID/clean code, sem gambiarra: cada unidade com uma responsabilidade e interface clara.

## Parte 1 — Banco

### 1a. Acesso de serviço (core `sql/`)

- Role `service_role NOLOGIN BYPASSRLS`, `GRANT service_role TO authenticator`.
- GRANTs mínimos: `auth.users` (SELECT, UPDATE), `auth.user_identities` (SELECT, DELETE),
  `auth.tenants` (SELECT), `public.services` (SELECT, UPDATE), `public.notifications` (INSERT),
  `EXECUTE ON auth.fun_notify`. O plugin `tickets` concede as suas tabelas ao `service_role`.
- Token: JWT `{ "role": "service_role" }` assinado com `PGRST_JWT_SECRET`, em
  `POSTGREST_SERVICE_TOKEN` (lido por `getServiceAuthHeader`, já existente). Só servidor. Gerado
  por comando novo do CLI: `node kizuna-core/cli token service`.

### 1b. `auth.users.deleted_login`

- `deleted_login text` (e-mail original da conta excluída).
- Índice parcial `(deleted_login) WHERE deleted_at IS NOT NULL`.

### 1c. Plugin `tickets` (`plugins/tickets/0001_tickets.sql`)

**`public.tickets`**: `id`, `uid`, `type` (`support` | `account_recreated`), `title`,
`description`, `status` (`open` | `in_progress` | `resolved`, default `open`), `created_by` (NULL =
sistema; default usuário da sessão), `subject_user_id`, `related_user_id`, `payload jsonb`,
`created_at`, `updated_at`, `resolved_at`.

| Quem | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `auth_user` | `created_by = eu` | `created_by = eu AND type = 'support' AND status = 'open'` | não | não |
| `tickets.manage` (root sempre) | todos | sim | `status`, `resolved_at`, `updated_at` | não |
| `service_role` | todos | sim | — | — |

**`public.ticket_comments`**: `id`, `uid`, `ticket_id` (FK cascade), `author_id` (default sessão),
`author_is_staff boolean`, `kind` (`comment` | `status_change`), `body`, `created_at`, `updated_at`,
`deleted_at`.

| Quem | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `auth_user` | comentários de tickets visíveis, `deleted_at IS NULL` | ticket visível, `author_id = eu`, `kind = 'comment'`, `author_is_staff = false` | só os próprios, `deleted_at IS NULL`, **sem resposta de staff posterior**; colunas `body`, `updated_at`, `deleted_at` | não |
| `tickets.manage` | todos (inclusive apagados) | sim, `author_is_staff = true` | os próprios | não |

- "Sem resposta de staff posterior" = `NOT EXISTS (comentário do mesmo ticket com author_is_staff
  AND created_at > este.created_at)`. Editar e apagar seguem a mesma regra (RLS não compara
  OLD/NEW). Apagar = `deleted_at = now()` (lógico).
- `author_is_staff` travado por `WITH CHECK author_is_staff = auth.fun_auth_has_perm('tickets','manage')`.
- Mudança de status (staff) = UPDATE em `tickets` + INSERT de comentário `status_change`. Duas
  escritas, não atômicas (sem função): status primeiro, comentário depois.
- Índices: `tickets (created_by, created_at DESC)`, `tickets (status, created_at DESC)`,
  `ticket_comments (ticket_id, created_at)`.
- Permissão RBAC `tickets.manage` registrada; `plugin_registry` (`tickets`, `1.0.0`).

## Parte 2 — Fluxos no servidor

### 2a. Excluir conta — `POST /api/account/delete` (core)

- Pré-condições: sessão válida, **login recente (≤ 15 min, `iat` do JWT)**, corpo `{ email }` igual
  ao login da sessão, não-root. Senão 400/401/403 com código de erro.
- Passos com token de serviço, nesta ordem (todos idempotentes):
  1. `services.active = false` do(s) tenant(s) do usuário;
  2. DELETE `auth.user_identities` do usuário;
  3. UPDATE `auth.users`: `deleted_login = login`, `login = 'deleted:' || uid || ':' || login`,
     `is_active = false`, `deleted_at = now()`, `phone = NULL`, `sessions_revoked_at = now()`.
- Limpa o cookie de sessão; responde `{ ok: true }`.

### 2b. Revogação de sessão no proxy (core)

- `createKizunaProxy`: com cookie de sessão válido, consulta `is_active` e `sessions_revoked_at` do
  usuário (token de serviço, PK) com **cache em memória de 60 s por usuário**. Conta inativa ou
  `iat < sessions_revoked_at` → limpa o cookie e trata como deslogado (redirect de rota protegida
  para login; demais seguem sem sessão).
- Sem token de serviço configurado: o check é pulado (não quebra projetos existentes), com aviso no
  log uma vez.

### 2c. Detectar recriação (core)

- Após cadastro por senha bem-sucedido (`createRegisterHandler`) e após OAuth com
  `created: true` (`createOAuthCallbackHandler`): chama `reportAccountRecreation({ login, newUserId })`.
- Busca `auth.users WHERE deleted_login = login AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`.
  Se houver: cria ticket `account_recreated` (`created_by` NULL, `subject_user_id` = nova,
  `related_user_id` = última excluída, `payload` = `{ login, deletedAt, previousDeletions }`) e
  notifica cada root ativo via `auth.fun_notify` (`context_type = 'ticket'`, `context_id` = uid).
- Falha aqui **não falha o cadastro**: loga e segue. Plugin `tickets` ausente (tabela 404) → no-op.

## Parte 3 — Telas

- **Minha conta**: bloco novo `delete-account` (zona de perigo) no `MINHA_CONTA_SCREEN`: explica o
  efeito, campo "digite seu e-mail", botão. Login antigo → mensagem pedindo para entrar de novo.
- **`/painel/chamados`** (item de menu "Chamados", todos os usuários): lista via `/resources`
  (usuário vê os seus, staff vê todos — RLS), filtro por status, botão "Novo chamado" (form
  `title`/`description`).
- **`/painel/chamados/[uid]`**: cabeçalho (título, tipo, status, contas envolvidas para staff),
  seletor de status (só staff), thread de comentários (componente `ticket-thread`): novo
  comentário; editar/apagar os próprios enquanto não houver resposta de staff; staff vê apagados
  marcados "comentário excluído".
- **Alerta ao root**: contador de chamados `open` no item "Chamados" (`renderItemBadge`), só para
  `tickets.manage`. O core não tem sininho; a notificação é gravada para uso futuro.

## Fora de escopo

Sininho/feed de notificações; atribuição de responsável; anexos; e-mail ao abrir ticket; restaurar
conta excluída; transferir dados da conta antiga.

## Testes

- Unit (vitest): serviço de exclusão (ordem dos passos, validações), `reportAccountRecreation`
  (achou/não achou/falha não propaga), cache de revogação do proxy, geração do token de serviço.
- Componentes: `delete-account`, `ticket-thread` (regras de editar/apagar na UI).
- RLS: roteiro SQL em `plugins/tickets/` para validar as policies num banco local.
- Navegador: fluxo excluir → recriar → ticket aparece para o root com contador.
