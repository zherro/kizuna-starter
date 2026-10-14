# Publicidade: slots, Google AdSense e criativos próprios

Data: 2026-10-13. Status: aguardando revisão.

## Objetivo

Gerenciar publicidade no app com duas fontes: Google AdSense e criativos próprios (imagem ou GIF).
Os criativos são cadastrados **por formato** e aparecem em **qualquer slot daquele formato**,
sorteados por peso junto com o Google. O root configura tudo e vê métricas.

## Decisões fechadas

- Mecânica de decisão: **pesos** (cada criativo tem peso; cada slot tem peso do Google).
- Sorteio **no navegador**, para a página continuar cacheável.
- Métrica por **contadores diários** (impressões e cliques), sem dado pessoal e sem cookie.
- Slots são definidos **em código** (posição física); o root só configura.
- Criativos próprios: só imagem/GIF + link. Sem HTML ou script de terceiros.
- Sem cobrança/faturamento de anunciante. Sem agendamento por dia da semana (só início e fim).

## Formatos e slots

Formato é o que liga criativo a slot. Catálogo em código (dimensões e altura reservada):

| formato | uso |
|---|---|
| faixa | largo e baixo (home) |
| banner | largo médio (entre trilhos, topo de cidade) |
| card | mesmo tamanho dos cards de lista |
| card-vertical | card do Descobrir |
| retangulo | rodapé de anúncio |

Slots iniciais (de `marketing/espacos-publicitarios.md`):

| slug | onde | formato |
|---|---|---|
| home-destaque | home, abaixo do hero | faixa |
| home-meio | home, entre trilhos | banner |
| trilho-card | card Destaque no trilho | card |
| busca-patrocinado | 1º ou 3º resultado da busca | card |
| descobrir-card | a cada N cards do swipe | card-vertical |
| cidade-topo | topo da página da cidade | banner |
| anuncio-rodape | Veja também, página de anúncio | retangulo |

## Dados (plugin SQL no core, idempotente, RLS)

- `ad_slots`: `slug` (PK), `enabled`, `media` (tipos aceitos: `imagem`, `gif`, `google`; o root
  marca por slot), `google_weight` (0 = sem Google), `google_ad_unit`, `rotate_seconds`
  (0 = só ao carregar).
- `ad_creatives`: `id`, `format`, `kind` (`imagem` ou `gif`), `image_url`, `alt`, `link_url`, `label` (anunciante), `weight`,
  `starts_at`, `ends_at`, `cities` (vazio = todas), `slots` (vazio = qualquer slot do formato;
  preenchido = restringe), `active`.
- `ad_stats_daily`: `slot_slug`, `creative_id` (nulo = Google), `page`, `day`, `impressions`,
  `clicks`; chave única por (slot, criativo, página, dia). `page` é o **padrão da rota**, não a
  URL (ex.: `/`, `/busca`, `/[cidade]`, `/anuncios/[id]`, `/descobrir`), para limitar
  cardinalidade e não vazar identificadores. Escrita por RPC pública `fn_ad_track` (incremento).
- Leitura pública só de slots habilitados e criativos vigentes. Escrita só ROOT (permissão RBAC).
- Config global em `kizuna.config.json`, bloco `ads`: id do cliente AdSense (`ca-pub-...`).

## Seleção e exibição (bloco `AdSlot` no core)

1. Candidatos: criativos ativos, vigentes, do formato do slot, de `kind` aceito em `media`, na cidade do contexto, e (se
   restritos) que listem o slot. Mais o item Google se `google` está em `media`, `google_weight > 0` e AdSense configurado.
2. Sorteio ponderado. Sem candidatos: o slot colapsa (sem buraco). Sem criativo próprio vigente:
   o Google ocupa 100%.
3. Rotação no lugar se `rotate_seconds > 0`, só com aba visível.
4. Marcação "Patrocinado" fixa. No máximo 1 espaço pago por tela visível.
5. Altura reservada por formato (evita salto de layout).
6. Impressão: visível ≥ 50% por 1 s, uma vez por montagem. Clique: só criativo próprio, link com
   `rel="sponsored noopener"`.
7. Google: script carregado só se houver item Google sorteado e com consentimento. Mede só
   impressão; clique e receita reais ficam no relatório do AdSense.

## Painel root (`/painel/root/ads`, tela registrada em `ROOT_SCREEN_REGISTRY`)

- **Slots**: on/off, tipos de mídia aceitos (imagem, GIF, Google), peso do Google, ad unit, rotação, métricas do período.
- **Criativos**: cadastro por formato com upload (storage/sharp existentes), link, alt, peso,
  vigência, cidades, restrição opcional de slots, ativo, métricas por criativo.
- **Métricas**: 7/30/90 dias; por slot, criativo e **página** (qual anúncio entregou em qual
  página, com filtro cruzado slot x página x criativo); impressões, cliques, CTR, série por dia;
  Google com a ressalva de só impressões.

## Testes

- vitest: sorteio ponderado, filtro de vigência/cidade/slot, agregação de métricas.
- Smoke SQL com rollback: RLS e `fn_ad_track`.
- UI: subagentes + frontend-design + ui-review; blocos reutilizáveis no core, página só monta.

## Fora do escopo agora

Agendamento por dia/hora, segmentação por categoria, cobrança, alcance único por visitante.
