# Plugin `swipe` — /descobrir (design)

Data: 2026-09-25

## Objetivo

Página pública `/descobrir` onde o usuário desliza cards dos itens da busca (genérico: qualquer nicho
servido por `fn_search_services`), curte (salva) ou passa. Usa o mesmo filtro do `/busca`.
Curtidos ficam em `/curtidos`.

## Regras de produto

- `/descobrir` é público. Anônimo pode passar cards; **curtir exige login**.
- Curtido nunca volta ao deck. Passado volta após `skip_ttl_days` (padrão 7, via `system_config`).
- Deck carrega em lotes de 20; ao restarem 5 cards, busca o próximo lote (prefetch).
- Mudar o filtro zera o deck.
- Ação que exige login abre `AuthModal` (login ⇄ cadastro) sem sair da tela; no sucesso a ação
  pendente é executada (reload é aceitável).

## Banco (`plugins/swipe/0001_swipe.sql`)

- Tabela `service_swipes`: `user_id uuid`, `service_id bigint`, `action text check in ('like','skip')`,
  `updated_at timestamptz default now()`, `PRIMARY KEY (user_id, service_id)`.
  Upsert por swipe (`ON CONFLICT DO UPDATE`), não acumula linhas.
- RLS: `auth_user` com SELECT/INSERT/UPDATE/DELETE apenas em `user_id = auth.uid()`.
- `fn_swipe_deck(<mesmos filtros de fn_search_services>, p_seed, p_page_size, p_exclude uuid[])`:
  SECURITY DEFINER, `search_path` fixo, usuário vindo da sessão (nunca de parâmetro). Mesmas colunas
  de retorno da busca. Adiciona anti-join:
  `NOT EXISTS (swipe do usuário AND (like OR updated_at > now() - skip_ttl))` e `uid <> ALL(p_exclude)`.
  Anônimo: só `p_exclude`.
  Reuso da lógica de filtro: extrair o corpo filtrado de `fn_search_services` para uma função interna
  compartilhada (ou `fn_swipe_deck` chama `fn_search_services` com página grande + filtro). Decidir no
  plano pela opção que não duplique SQL.
- `fn_swipe_liked(p_page, p_page_size)`: curtidos do usuário, mais recentes primeiro.
- Config `swipe.skip_ttl_days` em `system_config`.

### Paginação

Sempre página 0: os já decididos saem pelo anti-join; os cards ainda no buffer do cliente vão em
`p_exclude`; `p_seed` fixo por sessão mantém ordem estável. Evita pulos/repetições do offset.

## Shell (`plugins/swipe/shell/`)

- `manifest.json` (owner `swipe`), depende de `search`, `services`, `taxonomy`, `user_data`,
  `reviews`, `location`. Entra depois de `search` em `kizuna.plugins.json`.
- `src/app/descobrir/page.tsx` → `<SwipePage/>` (managed).
- `src/app/curtidos/page.tsx` → `<SwipeLikedPage/>` (managed, protegida).

## Core (`src/client/components/`)

### Filtro
Reaproveitar `search/search-filters-panel.tsx` + `search/use-search-filters.ts` (sincroniza URL).
Ajustar apenas o necessário para uso fora do `SearchPage`.

### `swipe/`
- `SwipePage`: layout fornecido (card arrastável, botões passar/detalhes/curtir, tira de curtidos),
  card genérico: `cover_file_id`, `title`, `category`, `price`/`price_type`, `provider_name`,
  `rating`. Detalhes → rota de detalhe do serviço existente.
- `useSwipeDeck(filters)`: buffer dedup por `uid`, prefetch em 5 restantes, seed de sessão,
  swipe otimista (UI avança; upsert em background; falha só loga).
  Anônimo: passados em `localStorage`, enviados em `p_exclude`.
- `SwipeLikedPage`: grid de curtidos com "descurtir" (DELETE da linha).
- Migração pós-login: passados do `localStorage` enviados em lote (um upsert) e limpos.

### `auth/` (reaproveitável)
- `LoginForm` / `RegisterForm`: extraídos de `login-page.tsx` / `register-page.tsx` — formulário,
  captcha e visual atuais; props `onSuccess(user)` e `onSwitchMode()`. Sem navegação.
- `LoginPageContent` / `RegisterPageContent`: API externa inalterada; usam os forms e redirecionam.
- `AuthModal`: modal centralizado, mesmo card do login, abas login ⇄ cadastro. Fecha por X, Esc,
  clique fora e botão voltar do celular (`history.pushState` ao abrir + `popstate` fecha).
  "Esqueci a senha" é link para a página.
- `useRequireAuth()` → `requireAuth(action)`: logado executa; senão abre modal e guarda a ação
  pendente (também em `sessionStorage` para sobreviver a reload); sucesso fecha e executa.

## Fora de escopo

Recomendação por gosto, desfazer último swipe, contato direto pelo card, dados de eventos.

## Testes

- SQL: deck exclui curtidos; passado reaparece após TTL; `p_exclude` respeitado; anônimo funciona;
  RLS impede ler swipes de outro usuário.
- Unit: `useSwipeDeck` (prefetch no limiar, dedup, reset ao mudar filtro); `useRequireAuth`
  (executa ação pendente após sucesso); `AuthModal` fecha em popstate.
- Regressão: páginas de login/cadastro continuam redirecionando como antes.
