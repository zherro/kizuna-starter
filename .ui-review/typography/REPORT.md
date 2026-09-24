# ui-review: Typography (component mode) — 2026-09-23
Mode: standard (component) · navegador embutido do Claude (agent-browser não instalado) · ui-review 1.2.0

Página temporária com H1–H6, Lead, Small, escala xs–6xl, `font="display"`, `measure`, `lineClamp`,
URL longa, palavras longas e `Span` inline. Removida após a revisão.

## Summary
0 broken · 0 degraded · 1 polish (corrigido). Sem rolagem horizontal nem texto cortado em nenhuma largura.

## Tamanhos medidos (px)
| | 360 | 768 | 1366 |
|---|---|---|---|
| H1 | 30 | 39.8 | 52 |
| H2 | 24 | 29.3 | 36 |
| H3 | 22 | 25.5 | 30 |
| H4 | 20 | 21.8 | 24 |
| H5 / Lead | 18 | 18.9 | 20 |
| P / H6 | 16 | 16.5 | 17 |
| Small | 14 | 14 | 14 |

## Findings
| Sev | Element | Issue | Source | Fix |
|---|---|---|---|---|
| polish (fixed) | `measure="normal"` | 65ch rendia ~75 letras/linha (pico 83) em Roboto | kizuna-core/src/client/components/ui/typography.tsx (MEASURE_MAP) | normal 58ch (~66 letras), narrow 40ch (~46), wide 70ch |

## Console / network
Sem erros relevantes.
