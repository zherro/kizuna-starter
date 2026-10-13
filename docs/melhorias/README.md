# Melhorias — índice e status

Este chat só **documenta** (problema → solução → arquivos → aceite). A implementação é feita em outros chats,
um documento por melhoria, em `docs/melhorias/AAAA-MM-DD-<tema>.md`.

Última revisão: 2026-10-13. Status inferido do código e do `git log` (os checkboxes dos planos nunca foram marcados).

## 1. Já documentadas (specs/plans em `docs/superpowers/`)

| Tema | Documento | Status | Evidência / pendência |
|---|---|---|---|
| Swipe `/descobrir` | specs+plans 2026-09-25 | Entregue | plugin `swipe` (0001–0004), `src/app/descobrir`, `/curtidos` |
| Endereços do serviço (N por serviço) | plans 2026-09-26 | Entregue (doc desatualizado) | `services/0003_service_addresses.sql` existe; o plano ainda diz "nada implementado". Marcar como concluído |
| Métricas do anunciante (analytics) | plans 2026-09-29 | Entregue (backend + painel) | plugin `analytics`, `src/app/painel/metricas`, `src/lib/analytics.ts`. Plano diz "sem spec" |
| Níveis de conta | specs+plans 2026-09-29 | Entregue | `kizuna-core/src/shared/account-levels`, `server/account-levels.ts` |
| Tickets + exclusão de conta | specs+plans 2026-09-29 | Entregue | plugin `tickets`, `src/app/painel/chamados` |
| Tema `soft` (fases 1 e 2) | specs+plans 2026-09-29 | Entregue | fase 2 "concluída"; tokens `--ui-*` em uso. Fase 1 ainda diz "aguardando aprovação" |
| Cidade na URL | specs+plans 2026-10-01 | Entregue | `src/app/[cidade]`, `shared/city-routing` |
| Gostei e Favorito | specs+plans 2026-10-01 | Entregue | `services/0008_services_like_count.sql`, `src/app/painel/favoritos` |
| Lugares (conteúdo Markdown) | specs+plans 2026-10-11 | Entregue, **mas superado** | commit `0df7912`; depois `ab1d242` "lugares viram serviços". Spec ainda "aguardando revisão" e não descreve o modelo atual |

Ação de higiene (1 chat curto): atualizar os cabeçalhos `Status:` dos planos acima e anotar no spec de Lugares
que o modelo vigente é "lugar = serviço" (ver `docs/integracoes/lugares-depara.md`).

## 2. Entregues mas **sem** documento de design/plano

Só existem mensagens de commit e, em parte, `docs/integracoes/`. Candidatos a documentação retroativa curta
(decisão + como funciona), para outros chats não reinventarem:

- Busca estilo OLX: filtro, multi-categoria, cidades editáveis, `p_tags` na busca (`89ec22a`, `ab1d242`)
- Eventos por formato/grupo: variant `evento`, `sectionTitles`, trilhas da home, teatro/cinema (`9000bc4`…`c643da9`)
- Regiões (`regions`: Grande Cuiabá + Chapada), cinema da home por região (`b5a8f9c`)
- Tags/código do anúncio, passo "Vínculos" do wizard, organizador do evento (`ab1d242`)
- Verificação de e-mail por link criptografado (`d6210f2`, `5a205a1`)
- Login Google em popup + One Tap (`5f6d45d`, `cab6cd7`)
- Storage: miniaturas `?size=thumb`, tela root, `/api/images/optimize` com sharp (`82eb205`, `6497ae0`)
- IA: revisão de texto / `ai_assistant` / `ai_review` (`372f387`, `82569c4`)
- Casca genérica do swipe migrada ao core (`fff91d7`)

## 3. Backlog novo (a preencher conforme chegarem)

Formato de cada item: **Problema** · **Solução proposta** · **Arquivos/áreas** · **Riscos** · **Aceite** · **Tamanho**.

| # | Melhoria | Problema | Solução | Prioridade | Doc |
|---|---|---|---|---|---|
| 1 | Busca: só grupos/categorias com registros | Painel de filtros lista taxonomia vazia (só o carrossel filtra) | Cruzar `buildFilterTaxonomy` com `category_service_stats`; subcategoria via nova view (opção A) | Média | [doc](2026-10-13-busca-so-grupos-e-categorias-com-registros.md) |
| 2 | Busca: filtros desktop fixos com scroll próprio | `sticky top-4` sem `max-h`/overflow e ignora o header sticky | Wrapper com `top` do header + `max-h` + `overflow-y-auto` | Baixa | [doc](2026-10-13-busca-filtros-desktop-fixos-com-scroll-proprio.md) |
