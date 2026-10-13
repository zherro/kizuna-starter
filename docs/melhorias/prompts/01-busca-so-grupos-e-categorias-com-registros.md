Implemente a melhoria documentada em `docs/melhorias/2026-10-13-busca-so-grupos-e-categorias-com-registros.md` (leia o documento inteiro primeiro, inclusive riscos e critérios de aceite).

Resumo: no `/busca`, o painel de filtros (grupos, categorias, subcategorias) deve mostrar só o que tem anúncio publicado e não vencido, igual ao carrossel de categorias. Cruzar `buildFilterTaxonomy` com o resource `category_service_stats`, controlado pela chave existente `home.categoriesOnlyWithListings`. Falha da fonte de contagem não pode esvaziar o filtro.

Decisão já tomada: implemente categorias e grupos (parte 1). Para subcategorias (parte 2, view nova na migração do plugin `services`), PERGUNTE-ME antes de fazer.

Regras do projeto:
- A lógica e os componentes ficam no `kizuna-core`; o starter só liga config e monta. Registre mudança de componente no showcase do core quando couber.
- Por ser UI: execute com subagentes, passe `frontend-design` nas tarefas de interface e rode `ui-review` na `/busca` ao final (desktop e mobile).
- Escreva testes (vitest) em `filter-taxonomy.test.ts` cobrindo os casos do critério 7.
- Em qualquer `.md`, não escreva classes Tailwind com colchetes inválidos (o Tailwind varre `.md`).
- NÃO faça commit nem push; só quando eu pedir.
- Ao final, marque o status do documento como implementado e liste o que foi verificado.
