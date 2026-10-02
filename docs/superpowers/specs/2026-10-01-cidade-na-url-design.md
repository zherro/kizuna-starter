# Cidade na URL (rota por cidade) — design

Data: 2026-10-01. Escopo: kizuna-core (`src/shared`, `src/server/services`, `src/client`) + starter
(rotas, layout, cookie).

## Objetivo

Hoje a cidade vive só em `localStorage` (`user_location`) e na query da busca (`?cityName=`). O
detalhe do anúncio é `/anuncios/[uid]`, sem cidade. Queremos:

1. **Cidade no caminho da URL**, na raiz do app: `/cuiaba-mt`, `/cuiaba-mt/anuncio/[uid]`.
2. **Detalhe com link fixo por cidade**: a cidade da URL é sempre a cidade real do anúncio.
3. Conteúdo por cidade indexável (SEO) e compartilhável, sem depender de geolocalização.
4. Nunca mostrar "uma cidade no topo e outra no detalhe" sem o usuário entender o porquê.

Referência de mercado: OLX usa caminho (`/estado-mt/região/cidade`), categoria antes da localização.
Aqui a cidade vai primeiro porque o produto é local e a home é por cidade.

## Restrições (decididas)

- Nenhuma função/view nova no banco; **nenhuma coluna nova**. O slug é derivado do nome + UF.
- Só cidades com `location_city.search_city = true` têm rota (mesma lista do seletor).
- A preferência de cidade do usuário continua em `localStorage` (hook `useUserLocation`) e ganha um
  **cookie espelho** `kz_city` (valor = slug) para o servidor poder redirecionar `/`.
- Mudanças no core ficam isoladas e aditivas: sem os novos props/provider o comportamento atual
  do seletor e da busca é idêntico.

## Rotas

| Rota | O que é |
|---|---|
| `/` | Home global. Com cookie `kz_city` válido, redireciona (307) para `/[cidade]`. |
| `/[cidade]` | Home da cidade (mesma `HomeContent`, conteúdo filtrado pela cidade). |
| `/[cidade]/[categoria]` | **Iteração seguinte.** Anúncios de uma categoria na cidade (slug de `categories.slug`). |
| `/[cidade]/anuncio/[uid]` | Detalhe. **Canônico.** |
| `/anuncios/[uid]` | Legado. Redireciona (308) para o canônico; anúncio sem cidade resolvível continua renderizando aqui. |
| `/busca?...` | Busca global/livre. Filtros finos (preço, ordenação, `cityName`) continuam em query. |

Rotas estáticas existentes (`/login`, `/painel`, `/busca`, `/descobrir`, `/curtidos`, `/anuncios`,
`/api`...) têm prioridade sobre `[cidade]` no roteador do Next. Mesmo assim existe uma lista de
**slugs reservados** (`RESERVED_SLUGS`) que um slug de cidade nunca pode igualar; teste garante.

## Slug da cidade

`slug = slugify(nome) + '-' + uf` em minúsculas, sem acento: `Cuiabá/MT → cuiaba-mt`,
`Várzea Grande/MT → varzea-grande-mt`. Sempre com UF, mesmo sem homônima: o slug **não muda** se
uma cidade homônima entrar na lista depois (link fixo = regra fixa). A regra vive numa função
(`citySlug`), então trocar o formato é uma mudança num lugar só.

## Cidade canônica do anúncio

Um anúncio pode ter N endereços (`service_addresses`) ou nenhum (remoto / no cliente). Regra, em
ordem:

1. endereço **principal** ativo (`is_primary`) com `city_ibge` na lista de cidades atendidas;
2. senão, o primeiro endereço ativo com `city_ibge` na lista;
3. senão, a cidade do perfil do prestador (nome + UF) se existir na lista;
4. senão, **sem cidade**: o anúncio fica só em `/anuncios/[uid]`.

A cidade canônica entra em `ServiceDetailData.city` (`{ ibge, name, state }` ou `null`).

## Regras de negócio

| Situação | Comportamento |
|---|---|
| URL = cookie | Topo normal, sem convite |
| URL ≠ cookie | Topo mostra a cidade da URL; ao lado, convite "Ver mais serviços em {cidade do cookie}" |
| Sem cookie | Topo mostra a cidade da URL; convite vira "Escolher minha cidade" |
| Clicar no convite | Abre o seletor com a cidade do cookie **pré-selecionada** e a cidade da URL como atalho "Ficar em {cidade da URL}" |
| Confirmar a cidade do cookie/outra | Grava cookie, vai para `/[cidade]` |
| Confirmar a cidade da URL | Grava cookie e **permanece** na página (já bate com a URL) |
| Fechar o seletor | Nada muda |
| Abrir link de outra cidade (compartilhado, Google) | **Não** altera a preferência |
| Logo/Home | `/` → redireciona para a cidade do cookie |
| Detalhe com cidade errada na URL | Redirect permanente (308) para a cidade real do anúncio |
| Anúncio sem cidade resolvível | `/[cidade]/anuncio/[uid]` redireciona (308) para `/anuncios/[uid]` |
| Slug de cidade desconhecido | 404 |
| Trocar cidade no seletor (manual) estando numa rota de cidade | Navega para `/[nova]` |
| Detecção por IP/GPS no primeiro acesso | Grava cookie; **nunca** navega |

A preferência só muda por escolha explícita (seletor) ou detecção inicial sem cookie.

## Seletor (core)

`LocationModal` ganha um **modo de confirmação**, ligado automaticamente quando há uma cidade
"em exibição" (contexto) diferente da cidade salva:

- cidade salva vem pré-selecionada (destacada), com botão **Confirmar**;
- a cidade em exibição aparece fixada no topo da lista como "Ficar em {cidade}";
- clicar numa cidade só seleciona; **Confirmar** grava (`source: 'manual'`);
- sem cidade em exibição, o modal funciona exatamente como hoje (clique na cidade grava).

A cidade em exibição vem de um contexto leve (`ViewingCityProvider` / `ViewingCityMarker`) no
core; `LocationTrigger` também o usa para mostrar a cidade da URL no topo.

## Cards

O `href` dos cards (busca e trilhas) passa a ser o canônico quando o resultado traz cidade e UF
(`/[slug]/anuncio/[uid]`), senão o legado (que redireciona). As trilhas (`ServiceCarousel`) ganham
`showCity` (default `false`, igual a hoje): a home global liga e mostra `Cidade` / `Cidade +N`; a
home da cidade deixa desligado, porque a cidade já está no topo. A busca global continua mostrando
a cidade como hoje.

## SEO

- `generateMetadata` de `/[cidade]` e do detalhe: title/description com a cidade; canonical sempre
  o caminho canônico.
- JSON-LD de breadcrumb: Início › Cidade › (Categoria) › Anúncio.
- `sitemap.ts` lista `/[cidade]` de cada cidade atendida.
- `/[cidade]` e detalhe herdam `revalidate = 300`, como o detalhe atual.

## Fora de escopo

- Região/bairro no caminho, subdomínio por cidade, slug de título no link do anúncio.
- Página `/[cidade]/[categoria]` (listagem por categoria dentro da cidade) — iteração seguinte.
- Migrar links antigos compartilhados fora do site: cobertos pelo redirect permanente do legado.

## Riscos

- **Cidade removida do seletor** (`search_city = false`): `/[cidade]` vira 404 e o detalhe cai no
  legado via redirect. Cookie com slug inválido é ignorado (home global), sem loop.
- **Anúncio com vários endereços em cidades diferentes**: aparece só na cidade canônica por URL;
  a busca por cidade continua achando por qualquer endereço (RPC inalterada).
- **`/` deixa de ser estática** ao ler o cookie para redirecionar; aceitável (a home já carrega
  dados no servidor).
