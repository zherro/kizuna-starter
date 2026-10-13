# ui-review: /busca (filtro estilo OLX) — 2026-10-13
Mode: standard (navegador embutido + detect.js; agent-browser não instalado) · breakpoints: desktop 1366, mobile 360

## Resumo
0 broken · 3 degraded/polish corrigidos · 1 polish aberto. Sem scroll horizontal, sem imagem quebrada.

## mobile (360x800) — Sheet de filtros
| Sev | Elemento | Problema | Fonte | Situação |
|---|---|---|---|---|
| degraded | botão "desmarcar" (lista de categorias) | alvo de toque 57x16 | search/filters/filter-category-list.tsx | corrigido (min-h-11 no mobile) |
| polish | × de remover cidade | alvo 36x36 | search/filters/filter-city-chips.tsx | corrigido (44px no mobile) |
| polish | título "Filtros" duplicado (SheetTitle + painel) | search-filters-panel.tsx / search-page.tsx | corrigido (`hideTitle` nos Sheets) |
| polish | "Fechar" do Sheet 32x32 | componente ui/sheet compartilhado | aberto (fora do escopo) |

## desktop (1366x768) — coluna fixa
Sem achados no painel. Grupo `‹ Eventos / Trocar de grupo`, categorias com check, selecionadas sobem destacadas, chips de cidade e "Estado inteiro" funcionando.

## Console / rede
- fn_search_services 200; hidratação em `LocationGate` (anterior a este trabalho).
