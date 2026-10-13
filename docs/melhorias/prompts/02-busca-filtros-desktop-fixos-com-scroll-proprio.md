Implemente a melhoria documentada em `docs/melhorias/2026-10-13-busca-filtros-desktop-fixos-com-scroll-proprio.md` (leia o documento inteiro primeiro).

Resumo: no desktop (`lg+`), a coluna de filtros do `/busca` deve ficar fixa abaixo do header do site, com altura máxima da janela e scroll próprio. Hoje o wrapper é só `sticky top-4` em `kizuna-core/src/client/components/search/search-page.tsx` (~linha 777), sem altura máxima, e fica por baixo do header sticky.

Antes de codar: meça a altura real dos dois topbars (`topbar.tsx` e `topbar-compact.tsx`) e decida entre variável CSS no layout ou valor fixo; confirme que nenhum ancestral com overflow quebra o sticky.

Regras do projeto:
- Mudança no `kizuna-core`; o starter não deve precisar de alteração.
- Por ser UI: use `frontend-design` e rode `ui-review` na `/busca` em 1024, 1280 e 1440 px, temas classic e soft, com os dois topbars, e confirme que mobile/tablet e o chat aberto não regridem.
- Em qualquer `.md`, não escreva classes Tailwind com colchetes (o Tailwind varre `.md`).
- NÃO faça commit nem push; só quando eu pedir.
- Ao final, marque o status do documento como implementado e informe o que foi verificado.
