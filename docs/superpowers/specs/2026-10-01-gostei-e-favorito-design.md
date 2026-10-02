# Gostei e Favorito no detalhe do anúncio — design

Data: 2026-10-01

## Objetivo

Na página de detalhe do anúncio (`/anuncios/[uid]`), o usuário pode **Gostei** e **Favoritar**.
Todo favorito também é um gostei. Os dois botões ficam no card flutuante da sidebar, junto do
Compartilhar (desktop: card sticky; mobile: card empilhado). Ícone e label de cada botão são
configuráveis em `kizuna.config.json`.

## Decisões

- O "gostei" é o "curtir" que o plugin swipe já grava (`action = 'like'`); o swipe e o `/curtidos`
  continuam funcionando.
- A tabela `service_swipes` é renomeada para `service_user_favorites` (dados preservados).
- Favorito é uma coluna na mesma linha: `favorite boolean`. Regra: `favorite ⇒ action = 'like'`.
  Tirar o gostei de um favorito **tira o favorito junto**.
- A contagem de gostei é do serviço: `services.like_count`.
- **Acesso só via `/api/resources`** (skill `criar-recurso`): nenhuma RPC nova. As `fn_swipe_*`
  existentes seguem como estão, só apontando para o nome novo da tabela.
- Gostei e Favoritar exigem login/cadastro via `AuthModal` / `useRequireAuth` (já existentes), que
  mantém o usuário na mesma página; a ação é aplicada após o sucesso do login.

## Banco (plugin swipe — migração idempotente `0003_*.sql`)

1. `ALTER TABLE service_swipes RENAME TO service_user_favorites` (se existir), renomeando índice,
   policy e constraints. `0001`/`0002` passam a usar o nome novo em instalações do zero.
2. `ADD COLUMN favorite boolean NOT NULL DEFAULT false` + CHECK `(NOT favorite OR action = 'like')`.
3. Para o resource: `ADD COLUMN uid uuid NOT NULL DEFAULT gen_random_uuid()` (unique, usado como
   `primaryKey` do resource, já que a PK atual é composta) e `user_id` com
   `DEFAULT auth.fun_auth_user_id()` — o client nunca manda `user_id`. A RLS `owner` existente já
   restringe leitura/escrita às linhas do próprio usuário.
4. `services.like_count integer NOT NULL DEFAULT 0`, com backfill e um **trigger** AFTER
   INSERT/UPDATE/DELETE em `service_user_favorites` que ajusta o contador (único código SQL novo;
   é interno ao banco, não é exposto na API). Sem trigger não há como contar curtidas de outros
   usuários, pois a RLS esconde as linhas alheias. `like_count` entra no `select` do detalhe.
5. `fn_swipe_record`, `fn_swipe_deck`, `fn_swipe_liked`: só trocam o nome da tabela; `unlike`
   também zera `favorite`.
6. Atualizar `db/public.sql`, `swipe_test_smoke.sql`, `plugins/README.md`, `docs/plugins/README.md`.

## Resource (`screen-engine/resources/swipe.ts`, exportado pelo core)

Novo `resourceServiceReactions` (nome do recurso: `service_reactions`), spread em
`postgrestResources` do projeto:

```ts
service_reactions: {
  schema: 'public',
  table: 'service_user_favorites',
  select: 'uid,service_uid,action,favorite',
  primaryKey: 'uid',
  searchableColumns: [],
  requiredFields: ['serviceUid'],
  mapInput: (i) => {
    const favorite = i.favorite === true;
    const liked = favorite || i.liked === true;
    return { service_uid: i.serviceUid, action: liked ? 'like' : 'skip', favorite };
  },
  mapOutput: (r) => ({ uid, serviceUid, liked: r.action === 'like', favorite: r.favorite }),
}
```

- `mapInput` aplica a regra (favorito ⇒ gostei; desgostar ⇒ desfavoritar). Como o update
  regrava o registro inteiro, o client sempre envia `{ serviceUid, liked, favorite }` completo.
- Leitura do estado: `GET /api/resources/service_reactions?filter.service_uid=<uid>` — a RLS
  devolve só a linha do usuário. Visitante recebe 401 → tratado como "não curtiu".
- Gravar: sem linha → `POST`; com linha → `PATCH /service_reactions/:uid`.
- Nenhum `DELETE`: desgostar grava `action = 'skip'` (mesma regra do swipe, o item volta ao deck
  após o TTL).

## Config

`kizuna.config.json` e `kizuna-core/starter/kizuna.config.json`:

```json
"serviceDetail": {
  "reactions": {
    "like":     { "icon": "ThumbsUp", "label": "Gostei",    "labelActive": "Gostei" },
    "favorite": { "icon": "Heart",    "label": "Favoritar", "labelActive": "Favoritado" }
  }
}
```

- `icon`: nome de ícone lucide (mesmo padrão de string já usado na config); inválido → fallback
  (`ThumbsUp` / `Heart`).
- Bloco ausente → o botão correspondente não aparece. Plugin swipe desligado → nenhum aparece.
- Tipo `ServiceDetailConfig` ganha `reactions`.

## Cliente (kizuna-core)

- `ServiceReactionButtons` (novo, `services/detail/`), renderizado em `service-detail-page.tsx`
  ao lado de `AdShareButton`, também na sidebar do cinema.
- Lê o estado pelo resource no cliente (a página é ISR anônima); o contador inicial vem do
  servidor (`like_count`).
- Clique: atualização otimista → POST/PATCH no resource → rollback + toast em erro.
- Sem usuário: `useRequireAuth` abre o `AuthModal`; após sucesso, aplica a ação pendente e o
  usuário permanece na página.
- Analytics: `favorite` já existe (`trackEvent`); gostei não ganha evento novo.
- Documentar em `docs/interface/componentes.md` e `docs/plugins/`.

## Testes

- Componente: estado inicial, alternar, regras favorito⇒gostei e desgostar⇒desfavoritar,
  visitante → modal → ação aplicada, erro com rollback, bloco de config ausente.
- `mapInput`/`mapOutput` do resource.
- SQL (smoke): rename idempotente, CHECK, trigger do contador (inclusive backfill) e RLS.

## Fora de escopo

Aba "Favoritos" em `/curtidos` (a lista rica é `fn_swipe_liked`; filtrar favoritos ali exigiria
mexer na função ou montar o card por resource — fica para depois), notificação ao autor,
ordenação por popularidade, evento de analytics novo para gostei.
