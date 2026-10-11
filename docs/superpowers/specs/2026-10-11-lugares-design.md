# Lugares: artigos de lugares sobre um modelo de conteúdo (design)

Data: 2026-10-11 · Status: aguardando revisão · Substitui as versões anteriores

## Objetivo

Páginas editoriais de lugares de Cuiabá e região (Lua Morena, casas de festas, shoppings): texto
contando a história, mosaico de fotos que abre no visualizador do site, informações úteis, mapa
e "como chegar". Em desktop e mobile, com layout pensado para leitura. Complementa o anúncio: o
anúncio vende, o artigo conta.

Junto, nasce no core um **modelo de conteúdo**: o mecanismo genérico de "pasta de Markdown com
frontmatter validado e mídia ao lado". Lugares é a primeira coleção; guias e roteiros reaproveitam.

O bloco "Como chegar" é também o **gancho para pedir a localização do usuário**, no momento em que
ela tem utilidade clara para ele.

## Decisões

| Tema | Decisão |
|---|---|
| Mecanismo | No **core**: leitura, validação e listagem de coleções de conteúdo, links de rota, distância e hook de posição. Genérico. |
| Componentes | No **core**, **reutilizáveis e sem conhecer "lugares"**: cabeçalho, corpo, ficha de informações, mapa, como chegar, ações rápidas e a moldura de duas colunas. Só recebem props. |
| O que é "lugares" | No **starter**: a definição da coleção, o conteúdo e a rota, que **só monta a página** com os componentes do core. |
| Padrão de montagem | O mesmo do detalhe do anúncio: blocos exportados pelo core e uma página que os compõe com pontos de extensão (slots). O Screen Engine não serve aqui: é do `/painel`, só para ADMIN, e seu contêiner é de coluna única. |
| Fonte do conteúdo | Arquivos Markdown no git. Sem banco, sem painel. |
| Visualizador | Reaproveita `AdPhotoMosaic` e `PhotoLightbox` do core. |
| Mapa | Incorporação do OpenStreetMap (sem chave, sem biblioteca), carregada só quando entra na tela. |
| Como chegar | Links oficiais de rota do Google Maps e do Waze. Sem chave. |
| Regra entre campos | `defineCollection` aceita `validate(data)`, que devolve a mensagem de erro ou nulo. Lugares o usa para exigir latitude e longitude juntas. |
| Exclusão do Tailwind | `content/` e `docs/` saem da varredura em `globals.css` (`@source not`): o mesmo risco vale para os planos e specs. |
| Privacidade | A política do projeto ganha a seção "Mapas e localização" (OpenStreetMap, Google, Waze e a posição só no aparelho). |
| Dependências | Nenhuma nova. O core não tem dependências de runtime; o frontmatter usa parser próprio de subconjunto. |
| Documentação | Core: `docs/arquitetura/modelo-de-conteudo.md` (novo, no `SUMMARY.md`) e seção em `docs/arquitetura/utils.md`. |

Divisão que segue o `START.md`: o core tem lógica e telas genéricas; o projeto tem configuração e
apresentação. Aqui os blocos visuais também são genéricos (servem a lugar, guia, roteiro, evento),
então vão para o core; o que é próprio do Bora Cuiabá é a coleção, o conteúdo e a composição.

### Screen Engine: análise (2026-10-11)

O `RenderScreen` roda no servidor, é leve e serviria tecnicamente. Não é usado aqui por
adequação, não por custo:

| Ponto | Achado |
|---|---|
| Custo de render | Percorre a lista de blocos, resolve referências de contexto e monta uma `div`. Desprezível frente à leitura do conteúdo. |
| Peso do registro | Os 6 blocos pesados entram por `next/dynamic`; só `page-header` é import estático. Bem resolvido. |
| Acoplamento | Importar o registro numa página pública arrasta o módulo do `PageHeaderBlock`, que depende de `GatedCreateLink` (cliente, com gate de nível de conta). Conceito do painel dentro de página pública. |
| Contêiner | `SCREEN_CONTAINER_CLASS` é coluna única com `gap-6`; o artigo precisa de duas colunas com lateral fixa. |
| Acesso | `createScreenPage` redireciona quem não é ADMIN. Página pública teria de ser escrita à mão de qualquer forma. |
| Dados | Props são só JSON e vêm do config. O conteúdo vem de arquivos lidos por um loader; o config seria gerado a cada render, só para ser desfeito. |

Peso medido no build de produção existente (JavaScript de cliente referenciado por rota, sem
contar o que o `next/dynamic` carrega sob demanda): `/sobre` 327 KB bruto (102 KB gzip),
`/[cidade]/anuncio/[uid]` 1.463 KB (390 KB), `/painel/[...kizuna]` 1.626 KB (432 KB). A página
de lugar deve ficar perto de `/sobre` mais o mosaico e o visualizador, pois a composição direta
não importa o painel. Meta a validar no build: abaixo de 600 KB bruto.

## Core

```
src/server/content/            modelo de conteúdo (importado como @kizuna/core/server/content)
  index.ts  frontmatter.ts  collection.ts  types.ts   (testes ao lado)
src/shared/maps/               funções puras (importado como @kizuna/core/shared/maps)
  index.ts  directions.ts  distance.ts  embed.ts      (testes ao lado)
src/client/hooks/use-current-position.ts               hook de posição sob demanda
src/client/components/content/                         blocos reutilizáveis (ver abaixo)
  index.ts  article-layout  article-header  article-body  article-credits
  fact-sheet  location-map  directions-card  quick-actions   (testes ao lado)
```

### Componentes reutilizáveis

Importados como `@kizuna/core/client/components/content`. Todos recebem só dados e callbacks por
props, usam os tokens de tema do projeto (como o `AdPhotoMosaic`) e não conhecem `lugares`.
Todo bloco é opcional na composição: a página só renderiza o que tem dado.

| Componente | Recebe | Faz |
|---|---|---|
| `ArticleLayout` | slots `header`, `media`, `actions`, `children`, `aside`, `footer` | Moldura responsiva. Mobile: coluna única, na ordem header, media, actions, children, aside, footer. Desktop: coluna de leitura (cerca de 65 caracteres) + `aside` fixo ao rolar. |
| `ArticleHeader` | `kicker`, `title`, `summary`, `updatedAt` | Categoria e cidade, título, resumo, data de atualização. |
| `ArticleBody` | `markdown` | Tipografia de leitura longa: títulos, listas, citações, links, imagens. Tem renderizador de Markdown **próprio**, isolado em `content/`; o `PageView` das páginas institucionais não é tocado e os dois evoluem separados. |
| `ArticleCredits` | `text` | Linha discreta de créditos das fotos. |
| `FactSheet` | `rows: { icon, label, value, href? }[]` | Ficha "Informações". Linha sem valor não aparece; sem nenhuma linha, o bloco some. |
| `LocationMap` | `lat`, `lng`, `title` | Mapa incorporado do OpenStreetMap, carregado com `LazyMount`, altura reservada. |
| `DirectionsCard` | `destination`, `address`, `tips` | Botões Google Maps e Waze, copiar endereço, distância via `useCurrentPosition`. |
| `QuickActions` | `actions: { label, href, icon }[]` | Faixa de chips para o mobile (Como chegar, Ligar, Site). |
| `AdPhotoMosaic` | `photos`, `alt` | Já existe. Reaproveitado como está. |

### Modelo de conteúdo: API

```ts
defineCollection({
  name: 'lugares',
  contentDir: 'content/lugares',   // uma pasta por entrada, com index.md
  mediaDir: 'public/lugares',      // pasta com o mesmo slug, com as fotos
  mediaUrl: '/lugares',            // prefixo público das fotos
  fields: { /* ver tabela */ },
  publishWhen: { field: 'status', equals: 'aprovado' },
});

loadEntries(collection)        // { entries, errors }, só as publicáveis em entries
getEntry(collection, slug)     // Entry | null
```

`Entry`: `{ slug, data, body, media }`, com `media` sendo as URLs das fotos em ordem de nome.
Caminhos relativos ao diretório do projeto (raiz configurável, para teste).

| Tipo de campo | Opções | Uso |
|---|---|---|
| `string` | `required`, `max`, `url` | `titulo`, `resumo`, `site` (com `url`, só http e https) |
| `number` | `required`, `min`, `max` | `latitude`, `longitude` |
| `date` | `required` | `atualizado_em`, formato AAAA-MM-DD |
| `enum` | `values`, `required` | `status` |
| `list` | `required` | `horario`, um item por linha com hífen |

Subconjunto de YAML aceito: pares `chave: valor`, textos com ou sem aspas, listas com hífen,
comentários com `#`. Objetos aninhados, âncoras e multilinha **não são aceitos** e geram erro com
arquivo e linha, em vez de falhar em silêncio.

Erros: entrada com frontmatter inválido é omitida e entra em `errors` com caminho e motivo; não
derruba o build nem as outras entradas. Pasta sem fotos: `media` vazio. Slug fora de `a-z`, `0-9`
e hífen: erro.

### Funções de mapa e rota (puras)

| Função | Faz |
|---|---|
| `directionsLinks({ lat, lng, address, origin })` | Links de rota para Google Maps e Waze. Com coordenadas usa `destination=lat,lng`; só com endereço usa o texto codificado. Origem só no Google Maps (o Waze não aceita). |
| `distanceKm(a, b)` | Distância em linha reta (haversine). |
| `osmEmbedUrl({ lat, lng, zoom })` | URL da incorporação do OpenStreetMap com marcador e caixa ao redor do ponto. |

### Hook `useCurrentPosition`

Diferente do `useUserLocation` existente, que resolve **cidade/UF** e persiste em `localStorage`
para filtrar o site. Este pede **coordenadas exatas**, só quando o usuário clica:

- Estados: `idle`, `asking`, `granted`, `denied`, `unavailable`. Função `request()`.
- Nunca pede ao carregar a página, só em resposta a um clique.
- Coordenadas ficam **só em memória**: não vão para `localStorage`, nem para o servidor, nem para
  analytics. Só saem do navegador quando o usuário toca em "Abrir no Google Maps/Waze".
- Negado ou indisponível: o bloco continua útil com o destino, sem origem e sem distância.

## Starter: o que é "lugares"

```
src/lib/lugares.ts                          defineCollection de lugares
src/app/[cidade]/lugares/[slug]/page.tsx    rota e metadata
content/lugares/<slug>/index.md             texto + frontmatter
public/lugares/<slug>/01.jpg ...            fotos
```

| Campo | Tipo | Observação |
|---|---|---|
| `titulo` | string, obrigatório | |
| `categoria` | string, obrigatório | Casa noturna, Casa de festas, Shopping |
| `cidade` | string, obrigatório | slug de cidade já usado em `/[cidade]` |
| `resumo` | string, obrigatório, até 155 | vira meta description |
| `status` | enum, obrigatório | `rascunho`, `revisao`, `aprovado`; só `aprovado` publica |
| `atualizado_em` | date, obrigatório | |
| `endereco` | string | texto completo |
| `latitude`, `longitude` | number | juntos ou nenhum; -90 a 90 e -180 a 180 |
| `horario` | list | ex.: "Qui a sáb, 22h às 5h" |
| `telefone`, `instagram` | string | |
| `site` | string, url | |
| `preco` | string | faixa ou observação |
| `dicas_chegada` | string | referência, estacionamento, transporte |
| `creditos` | string | autor e licença das fotos |

Todos os campos de informação são opcionais: **o layout é montado a partir do que existe**. Sem
coordenadas, some o mapa mas o endereço e os links de rota por texto continuam. Sem horário, a
linha não aparece.

### Layout

**Desktop:** duas colunas. À esquerda, o texto em largura de leitura (cerca de 65 caracteres por
linha), com subtítulos e listas bem espaçadas. À direita, uma coluna lateral fixa com
"Informações" e "Como chegar", que acompanha a leitura.

**Mobile:** coluna única. Título, mosaico, faixa de ações rápidas (Como chegar, Ligar, Site),
texto, e por fim os blocos de informações e mapa.

Ordem do conteúdo: título, categoria e cidade, mosaico, texto, créditos.

### Bloco "Como chegar"

1. Mapa (incorporado, carregado com o `LazyMount` do core) e endereço com botão "Copiar".
2. Botões "Google Maps" e "Waze" com o destino.
3. Botão "Ver distância e rota a partir de você": chama `request()`. Se concedido, mostra
   "cerca de X km em linha reta" (dito assim, para não passar por distância de percurso) e o
   Google Maps passa a abrir com origem. Se negado, mantém só o destino e avisa com uma linha.
4. `dicas_chegada` em texto, quando houver.

### Rota e metadata

- `/[cidade]/lugares/[slug]`, server component com `revalidate`, no molde de
  `[cidade]/anuncio/[uid]`. Os blocos interativos são componentes de cliente.
- `generateMetadata`: título, resumo e primeira foto como Open Graph.
- Inexistente, de outra cidade ou não publicado: 404.

## Testes

- **Conteúdo:** aspas, lista, comentário, sintaxe não suportada; campo ausente, enum inválido,
  `max` excedido, latitude fora da faixa, rascunho fora de `entries`, ordenação das fotos, pasta
  sem fotos, slug inválido.
- **Mapa:** links com e sem coordenadas, com e sem origem, texto com acento e espaço codificado;
  distância conhecida (par de pontos de Cuiabá); URL de incorporação.
- **Hook:** estados concedido, negado, indisponível, e que nada é gravado em `localStorage`.
- **Verificação visual** no navegador, desktop e mobile, com e sem coordenadas, abrindo o
  visualizador e negando a localização.

## Cuidados

- **Tailwind varre `.md`** e classe inválida em texto corrido quebra o CSS. Excluir `content/`
  da varredura em `globals.css` com `@source not`.
- **Privacidade e LGPD:** posição exata só sob clique, só em memória, e o texto do botão deixa
  claro para que ela serve. Se o site passar a guardar a posição, vira decisão nova com política
  de privacidade atualizada.
- **Terceiros:** o mapa carrega uma página do OpenStreetMap, e os links levam ao Google Maps e ao
  Waze. Mencionar na política de privacidade.
- **Fatos verificáveis:** coordenadas, endereço, horário, telefone e preço passam por apuração
  (`redacao-apuracao`) antes de `aprovado`. Lacuna fica `[A CONFIRMAR]` e o lugar em `rascunho`.
  O primeiro lugar entra como exemplo de estrutura, sem afirmar fato não verificado.
- Fotos exigem licença conferida (`redacao-imagens`) e crédito no frontmatter.
- `content/` e `public/lugares/` entram no git. O `redacao/` continua fora.
- **Dois repositórios:** o core é submódulo. Mudança no core exige commit no core e depois o
  bump do ponteiro e do `kizuna.lock` no starter. Commits só quando o dono pedir.

## Fora desta versão

Listagem `/[cidade]/lugares`, capítulos em vários arquivos, linha do tempo, índice lateral, mapa
com vários pontos, rota calculada no próprio site, uso da posição exata para atualizar a cidade
do filtro do site (o hook já deixa esse caminho aberto), ligação com o anúncio, edição pelo
painel, busca, layout do artigo no core.
