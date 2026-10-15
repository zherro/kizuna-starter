# ui-review: /showcase/painel-welcome — 2026-10-13
Mode: standard (parcial) · navegador embutido + detect.js · ui-review 1.2.0

## Escopo
Revisado o bloco `PainelWelcome` pelo showcase do core (público). A rota real `/painel` exige
login e NÃO foi revisada; a seção "Sua conta e seus anúncios" (AccountLevelCard, PainelHero,
PainelStats) também não, porque só aparece logado.

## Summary
0 broken · 0 degraded · 0 polish. Sem scroll horizontal, sem imagem quebrada, sem texto < 12px.

## mobile (360x800) e desktop (1366x900)
| Sev | Elemento | Resultado |
|---|---|---|
| ok | hero (h1 + CTAs + baralho) | CTAs empilham no mobile, baralho some < sm |
| ok | faixa "Seus favoritos" | scroller horizontal intencional (scroll-snap) |
| ok | atalhos | 1 coluna mobile, 3 colunas desktop |
| falso positivo | tiles de atalho "wrapped" | título + texto empilhados no mesmo link |

## Console / network
Erro de HMR antigo em `kizuna-core/src/client/components/services/detail/service-carousel.tsx:147`
(arquivo com mudanças do dono, fora deste trabalho); `tsc` passa sem ele.

## Pendente
Rodar em `/painel` logado (3 breakpoints + modo escuro) e com favoritos reais.
