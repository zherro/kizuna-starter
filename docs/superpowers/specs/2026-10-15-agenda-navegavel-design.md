# Links de navegação no evento (v1) — levantamento

**Data:** 2026-10-15 · **Status:** rascunho para aprovação · **Escopo v1:** só links para páginas que já existem. Nenhuma página, tabela ou RPC nova.

## Destinos que já existem

| Destino | Rota | O que entrega | Limite |
|---|---|---|---|
| Página do anúncio-lugar | `/[cidade]/anuncio/[uid]` (variant `lugar`) | Lugar + carrossel "Neste local" com os eventos que têm a tag `local:<codigo>` (`tagRails`, `service-detail-data.ts`) | Carrossel limitado (`MAX_DETAIL_TAG_RAILS`, poucos itens), sem ordem por data |
| Busca por texto | `/busca?q=<texto>` | `fn_search_services` com `plainto_tsquery` | Só procura em `title` + `description`. Nome de artista que só está em `artistas[]` (form_results) **não é encontrado** |
| Busca por categoria/grupo | `/busca?group=<slug>` · `?categoryIds=<id>` | Lista filtrada | Cidade vem do seletor do topo, nunca da URL |
| Página da cidade | `/[cidade]` | Home da cidade com trilhos por categoria/grupo | — |
| Lugar editorial | `/[cidade]/lugares/[slug]` | Conteúdo curado (`LUGARES`) | Não conhece eventos nem códigos de anúncio |

A `/busca` **não** aceita tag nem data pela URL (`use-search-filters.ts`: só `group`, `categoryIds`, `subcategoryIds`, `cidades`, `q`, `priceMin/Max`, `sort`).

## Para onde cada link do evento aponta

| Elemento do evento | Link v1 | Resolução |
|---|---|---|
| Local / "Onde acontece" | Página do anúncio-lugar | `venue.href` (`resolveServiceRefs`, sessão venue-server) |
| "Onde comprar" (código resolvido) | Página do anúncio do ponto de venda | `salePoints[].venue.href` |
| "Onde comprar" (não resolvido) | Sem link (texto humanizado) | — |
| Artista resolvido (código = slug do nome) | Página do anúncio do artista | `resolveServiceRefs([slug])` |
| Artista não resolvido | `/busca?q=<nome>` **somente se** o nome costuma aparecer no título/descrição; senão sem link | Ver risco abaixo |
| Categoria / grupo (chip) | `/busca?group=<slug>` ou `?categoryIds=<id>` | Já disponível no `service` |
| Cidade (endereço) | `/[cidade]` | `cityPath(city)` |
| Data | **Sem link na v1** | Não há destino por data |
| Página do lugar → "ver todos os eventos" | Nenhum destino além do carrossel | Fica para v2 |

**Risco:** um link de artista para `/busca?q=` pode cair em uma busca vazia, porque o nome não está indexado. Há duas saídas. Na v1, decidimos entre não ligar artistas não resolvidos ou ligar mesmo assim, aceitando o resultado parcial. Na v2, a busca passa a indexar `artistas[]`.

## Onde fica cada coisa

- **Core:** a variant evento (`service-detail-evento.tsx`) transforma local, pontos de venda, artistas e cidade em links a partir do resolver genérico. Não precisa de rota nova.
- **Starter:** nada obrigatório. O visual dos cards só muda se for necessário, e para isso existe o slot `renderVenueCard`.

## v2 — fora deste escopo

- **Agenda por data:** a rota `/[cidade]/agenda?dia=` e as ocorrências normalizadas (`service_occurrences`, mantidas por trigger em `form_results` a partir de `sessoes[].data` ou `data_inicio`), com a RPC `fn_agenda` ordenada por dia e hora. É isso que permite ligar a data do evento.
- **Agenda por artista:** a tabela `service_performers` (slug do nome), a rota `/[cidade]/agenda/artistas[/slug]` e o filtro "quais artistas vão vir por aí".
- **Agenda do lugar completa:** `/[cidade]/agenda/lugares/[codigo]`, em lista paginada e ordenada por data, no lugar do carrossel.
- **Busca:** indexar `artistas[]` na busca textual e aceitar `tag` pela URL.
