# Busca: mostrar só grupos e categorias que tenham registros

Data: 2026-10-13 · Status: parte 1 implementada em 2026-10-13 (categorias e grupos); parte 2 (subcategorias) pendente de decisão · Escopo: `kizuna-core` (client + SQL do plugin `services`); o starter só liga a config.

## Problema

No `/busca`, o **painel de filtros** lista todo grupo, categoria e subcategoria **ativos na taxonomia**, mesmo sem nenhum anúncio. O usuário clica, cai em resultado vazio ("beco sem saída").

O carrossel de categorias da busca **já** esconde as vazias; o painel de filtros não:

| Parte da busca | Fonte | Esconde vazias? |
|---|---|---|
| Carrossel de categorias (`CategoryCarousel`) | `category_stats` ∩ `category_service_stats` | **Sim**, quando `home.categoriesOnlyWithListings: true` (já está `true` no `kizuna.config.json`) |
| Painel de filtros: grupos, categorias, subcategorias (`useFilterTaxonomy`) | `categories_group_public`, `categories_public`, `category_stats` | **Não** |

Causa: `buildFilterTaxonomy` ([filter-taxonomy.ts](../../kizuna-core/src/client/components/search/filters/filter-taxonomy.ts)) só exige "categoria com ao menos uma subcategoria **ativa**" (vem de `vw_category_subcategory_stats`, que olha só a taxonomia). Nunca cruza com `services`. Grupos só somem se não tiverem categoria (`groupsWithCategories`), então herdam o problema.

## Solução

Reaproveitar o que o carrossel já usa e aplicar a mesma regra no painel.

### 1. Categorias e grupos (mudança pequena, só client)

- `use-filter-taxonomy.ts`: ler também o resource `category_service_stats` (já existe em `screen-engine/resources/services.ts`, `servicesCount` por categoria, já ignora anúncio vencido via `0010_services_category_stats_not_expired.sql`).
- `buildFilterTaxonomy` ganha o parâmetro `listings?: { categoryId; servicesCount }[] | null`. Quando presente, descarta categorias com `servicesCount = 0`. Quando `null` (flag desligada ou fonte falhou), comportamento atual.
- Grupos vazios saem sozinhos por `groupsWithCategories`.
- Controle: **mesma chave** do carrossel (`home.categoriesOnlyWithListings`), repassada pelo `/busca` ao `SearchPage` → `SearchFiltersPanel` → `useFilterTaxonomy({ onlyWithListings })`. Uma regra só, sem nova config.
- Falha da fonte de contagem **não** pode esvaziar o filtro: se `category_service_stats` der erro, cai no comportamento atual (mesma filosofia já documentada no hook).

### 2. Subcategorias (decisão pendente)

Hoje a view conta anúncios por **categoria**. Esconder subcategoria vazia exige contagem por subcategoria:

- **Opção A (recomendada):** nova view `vw_subcategory_service_stats` (`category_sub_id`, `category_id`, `services_count`) sobre `service_categories_sub` ⨝ `services` (`active`, `status='active'`, `expires_at` não vencido), como migração `services/0013_*`. Novo resource `subcategory_service_stats`; o filtro esconde subcategoria sem anúncio e, por consequência, categoria sem nenhuma subcategoria com anúncio.
- **Opção B:** parar em categoria/grupo e deixar subcategorias como estão. Entrega rápida, mas subcategoria vazia continua clicável.

Nota: um anúncio pode estar numa categoria sem ter subcategoria marcada. Na opção A, a categoria deve aparecer se tiver `services_count > 0` na view por categoria **ou** subcategorias com anúncio; senão some anúncio válido do filtro.

### 3. Contagem por cidade (fora do escopo, registrar)

Todas as contagens são globais; a busca é filtrada pela cidade do topo. Uma categoria pode ter anúncios só em outra cidade e continuar aparecendo na cidade atual. Resolver isso exige contagem por cidade (RPC/view parametrizada). **Não incluir agora**; abrir como melhoria própria se o resultado vazio por cidade incomodar.

## Arquivos

- `kizuna-core/src/client/components/search/filters/use-filter-taxonomy.ts` — 4ª fonte + parâmetro
- `kizuna-core/src/client/components/search/filters/filter-taxonomy.ts` — filtro por contagem (+ testes em `filter-taxonomy.test.ts`)
- `kizuna-core/src/client/components/search/search-filters-panel.tsx` e `search-page.tsx` — repassar a flag
- `src/app/busca/page.tsx` — passar `home.categoriesOnlyWithListings` (já lido no arquivo)
- Opção A: `kizuna-core/plugins/services/0013_*.sql` + `screen-engine/resources/services.ts` (+ `services.test.ts`) + `db/public.sql` regenerado + bump de versão do plugin e do `kizuna.lock`

## Riscos

- Painel pode ficar **sem nenhum grupo** em tenant sem anúncios: manter a mensagem vazia atual, não quebrar.
- Estado da URL: usuário com `?categoryId=` de categoria vazia (link antigo/compartilhado) — a categoria marcada deve continuar válida/visível como chip para ele poder limpar, mesmo sem aparecer na lista.
- `pageSize` das views: manter `maxPageSize: 1000` como no resource existente.

## Critérios de aceite

1. Com `categoriesOnlyWithListings: true`, nenhum grupo/categoria sem anúncio publicado e não vencido aparece no painel de filtros (desktop e mobile).
2. Publicar o primeiro anúncio numa categoria faz ela (e seu grupo) aparecerem; expirar/despublicar o último faz sumirem.
3. Com a flag `false`, comportamento idêntico ao atual.
4. Falha do resource de contagem não esvazia o filtro (teste unitário).
5. `?categoryId=<vazia>` na URL não quebra a tela e permite limpar o filtro.
6. (Opção A) subcategoria sem anúncio não aparece.
7. Testes em `filter-taxonomy.test.ts` cobrindo: com/sem listings, categoria só em grupo extra, fonte `null`.

## Implementação (parte 1)

- `filter-taxonomy.ts`: `buildFilterTaxonomy` aceita `listings` (null = não filtra) e `keepCategoryIds` (categorias marcadas na URL ficam mesmo sem anúncio, para poder limpar); novo `resolveListings` (flag desligada ou erro da fonte → null).
- `use-filter-taxonomy.ts`: 4ª fonte `category_service_stats`, só habilitada com `onlyWithListings`; entra no `loading`.
- `search-filters-panel.tsx` / `search-page.tsx`: repassam `onlyWithListings`, vindo de `categoryCarousel.onlyWithListings` (a mesma chave `home.categoriesOnlyWithListings`; o starter já passava, sem mudança em `src/app/busca/page.tsx`).
- Testes: `filter-taxonomy.test.ts` (30 + 3 de `resolveListings`; 76 passam em `search/`).

### Verificado

- Vitest da pasta `search`: passa.
- `/busca` no navegador (desktop 1440 e mobile 390, Sheet): painel só mostra o grupo/categoria com anúncio (Cinema, único com `servicesCount > 0`); sem overflow horizontal.
- `?categoryId=20` (categoria sem anúncio): tela não quebra, categoria aparece marcada e "desmarcar" limpa a URL.

### Não verificado / observações

- Estado vazio do painel só coberto em código, não exercitado no navegador.
- Fora do escopo, vistos na revisão: mismatch de hidratação em `LocationGate` (`useUserLocation`) e botão "Fechar" do Sheet com 32px.
