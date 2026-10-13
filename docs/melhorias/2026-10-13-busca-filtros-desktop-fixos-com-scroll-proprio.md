# Busca: filtros no desktop fixos na tela, com scroll próprio

Data: 2026-10-13 · Status: implementado (2026-10-13) · Escopo: `kizuna-core`, só CSS/markup em `search-page.tsx` (sem banco, sem config).

## Problema

No desktop (`lg+`), a coluna de filtros do `/busca` deveria ficar parada enquanto os resultados rolam, e quando o painel for mais alto que a tela (grupos + categorias + subcategorias + cidades + ordenação) ele precisa rolar sozinho. Hoje:

- O container tem `sticky top-4` ([search-page.tsx:777](../../kizuna-core/src/client/components/search/search-page.tsx)), mas **sem altura máxima nem overflow**. Painel mais alto que o viewport: o fim (cidades, ordenação, limpar filtros) fica **inalcançável** enquanto a página rola, porque o sticky prende o topo e o resto sai da tela.
- `top-4` ignora o cabeçalho do site, que é `sticky top-0 z-40` (`topbar.tsx:90`). O painel gruda por baixo do header e o título "Filtros" some atrás dele.

## Solução

Trocar o wrapper do `<aside>` por uma coluna sticky com altura limitada ao espaço visível e scroll interno:

O wrapper do `<aside>` mantém o card atual e ganha: posição sticky com o topo igual à altura do header
(mais uma folga pequena), altura máxima igual à altura da janela (`dvh`) menos o header e a folga,
scroll vertical automático, `overscroll-contain` e gutter de scrollbar estável. A altura do header
vem de uma variável CSS definida no layout (ver decisão 1); descrever o valor com `calc` e `var`
só dentro do código, nunca neste documento (o Tailwind varre `.md`).

Pontos de decisão (fechar na implementação):

1. **Altura do header:** hoje não há variável; o mobile usa `top-14` (3.5rem) fixo. Medir os dois topbars (`topbar.tsx`, `topbar-compact.tsx`) e definir variável de altura do header no layout (ou usar o valor fixo medido). Evitar número mágico duplicado.
2. **Sticky exige ancestral sem `overflow` e item com altura própria:** o `<aside>` é item do grid (esticado); o sticky vive dentro dele. Confirmar que nenhum ancestral (`main`, wrapper com `transition-[padding]`) tem `overflow` que quebre o sticky.
3. **Scroll interno discreto:** `overscroll-contain` evita que a rolagem "vaze" para a página ao chegar no fim; gutter estável de scrollbar evita pulo de layout quando a barra aparece.
4. **Rodapé de ações** ("Limpar filtros", contagem) deve ficar visível sem rolar: se `SearchFiltersPanel` tiver ações no fim, avaliar `sticky bottom-0` no bloco de ações dentro do container rolável.
5. **Chat aberto (`xl:`)**: o aside já some (`xl:hidden`); sem mudança.
6. **Mobile/tablet não mudam** (Sheet lateral já tem `overflow-y-auto`).

## Arquivos

- `kizuna-core/src/client/components/search/search-page.tsx` (linhas ~776–786)
- `kizuna-core/src/client/components/topbar.tsx` / `topbar-compact.tsx` (só se for expor variável de altura do header)
- Se existir: teste visual/`ui-review` da `/busca` em 1024, 1280 e 1440 px, com e sem anúncios longos.

## Riscos

- Em telas baixas (laptop 768px de altura) o painel ocupa quase tudo; garantir que o scroll interno funcione com roda e teclado (foco nos itens rola o container).
- Dois topbars com alturas diferentes: valor único errado deixa folga ou sobreposição.
- Animações `Collapse`/`Enter` do painel mudam a altura; o `max-h` deve acompanhar sem salto.

## Critérios de aceite

1. Em `lg+`, ao rolar os resultados, a coluna de filtros permanece visível logo abaixo do header, sem ficar atrás dele.
2. Com painel mais alto que a janela, o painel rola internamente e todos os controles (inclusive o último) ficam alcançáveis; a página não rola junto ao rolar o painel.
3. Sem barra de rolagem desnecessária quando o painel cabe na tela.
4. Funciona com os dois topbars (`topbar` e `topbar-compact`) e em temas `classic`/`soft`.
5. Nenhuma regressão em mobile/tablet nem com o chat desktop aberto.

## Implementação

- Decisão 1: nenhum valor fixo. Os dois topbars têm alturas diferentes (classic ~65px, compact ~57px) e a classic varia com logo/ações. O hook `use-header-height-var.ts` mede o header com ResizeObserver e publica a variável CSS `--kz-header-h` no `html`; `topbar.tsx` e `topbar-compact.tsx` o chamam. O wrapper em `search-page.tsx` usa essa variável (com fallback de 4.5rem) para o topo sticky e a altura máxima em `dvh`.
- Decisão 2: o único ancestral com overflow é o `html` (o scroll do viewport), então o sticky funciona.
- Decisão 4: o botão "Limpar filtros" fica no fim do painel e alcançável pelo scroll interno; não foi feito sticky no rodapé para não afetar o Sheet mobile, que reusa o painel.
- Verificado: header 65px (classic) e 57px (compact) com o painel gruda a 16px abaixo; temas classic/soft; 1024, 1280 e 1440 px; scroll interno com viewport baixo (página não rola junto); `lg` abaixo some o aside (768px sem regressão).
