# ui-review: https://boracuiaba.com.br/busca?group=todos — 2026-10-27
Mode: standard (navegador embutido + detect.js; agent-browser não instalado) · breakpoints: mobile 360, tablet 768, laptop 1366, desktop 1920

> Produção ainda **sem** o deploy de `d9187d3` (cards mais baixos, `gap-x-10`, zoom no pôster). O review é da versão no ar.

## Resumo
0 broken · 3 degraded · 3 polish. Sem scroll horizontal, sem imagem quebrada, sem placeholder vazado.

## laptop (1366x768) — grade de 5 colunas, card de 195px
| Sev | Elemento | Problema | Fonte | Fix |
|---|---|---|---|---|
| degraded | rodapé do card de evento/cinema | data "sáb., 14..." e local "Cuiab..." truncados ao lado do CTA; perde a informação principal | kizuna-core/src/client/components/ui-better-soft/lists/listing-result-card.tsx:328 | 5 colunas só a partir de ~1600px, ou CTA abaixo da data quando o card é estreito. O `gap-x-10` do último commit estreita o card para ~176px e piora isso |
| polish | card sem imagem ("Espaço Art Festas e Eventos") | área da imagem só com o gradiente, buraco visual na grade | kizuna-core/src/client/components/ui-better-soft/lists/media-result-card.tsx:61 | ícone da categoria ou monograma no lugar da foto |

## todos os breakpoints
| Sev | Elemento | Problema | Fonte | Fix |
|---|---|---|---|---|
| degraded | título vazio do carrossel de categorias | filete laranja + `<h2>` vazio acima dos ícones (busca passa `title=""`) | kizuna-core/src/client/components/taxonomy/category-carousel.tsx:241 e :285 (chamado em search/search-page.tsx:717) | não renderizar `Header` quando `title` for vazio |

## mobile (360x800)
| Sev | Elemento | Problema | Fonte | Fix |
|---|---|---|---|---|
| degraded | botão "trocar" (cidade) | alvo de toque 32x16 | kizuna-core/src/client/components/search/search-page.tsx:668 | `py-2 -my-2` / `min-h-6` |
| polish | links do rodapé (Inicio, Sobre, Termos…) | altura 20px (< 24) | rodapé do site | `py-1` nos links |
| polish | chips de categoria (11px) e mês do selo de data (10px) | texto pequeno; aceitável para rótulo, mas no limite | listing-result-card.tsx:69, :310 | manter ou subir para 11/12px |

Falsos positivos descartados: `wrappedControls` nos cards (o card inteiro é um `<a>` em bloco), sobreposição "sáb., 14 de nov." × "Entrar" (barra fixa inferior ao rolar), `span.sr-only` recortado.

## tablet (768x1024) / desktop (1920x1080)
Sem achados além dos acima. No 1920 o card tem 304px e o rodapé cabe inteiro.

## Console / rede
- Console: só erros do Google One Tap/FedCM sem sessão do Google (esperado).
- Rede: tudo 200; os `ERR_ABORTED` são prefetch de RSC cancelado (normal). `category_stats`, `categories_group_public` e `category_service_stats` são buscados 3–4× cada no carregamento (polish de performance).
