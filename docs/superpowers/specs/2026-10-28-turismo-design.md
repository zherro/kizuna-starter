# Turismo — design

**Data:** 2026-10-28 · **Status:** aprovado em chat · **Escopo:** seção de Turismo do Bora Cuiabá, com rotas, onde dormir, onde comer, o que fazer, distritos e Chapada dos Guimarães dentro da Grande Cuiabá.

## Intenção

Ter uma parte de turismo forte, que entregue o que o portal da Prefeitura de Cuiabá promete (rotas turísticas, onde dormir, onde comer, regiões/distritos) e vá além, com a cara do Bora. A referência (turismo.cuiaba.mt.gov.br) só lista nomes, sem texto. O texto é original, apurado e pronto para publicar. Não se copia texto de terceiros.

## Metas

- `/turismo` como porta de entrada e `/[cidade]/turismo` filtrado pela praça da cidade.
- Rotas turísticas com paradas, mapa, duração, dificuldade, melhor época e dicas.
- Onde dormir, onde comer e o que fazer como lugares editoriais, filtráveis por cidade e tipo.
- Distritos e regiões turísticas como páginas próprias.
- Chapada dos Guimarães (IBGE 5103007) dentro da região `grande-cuiaba`.
- Só entra no ar o conteúdo `aprovado`. Conteúdo fraco fica `rascunho` ou `revisao` (o "pendente").

## Não metas

- Sem política. Sem cadastro de donos nesta rodada (lugares são editoriais).
- Sem reserva/pagamento. Sem dados pessoais de terceiros.
- Sem tabela ou migration nova: tudo é conteúdo em arquivo.

## Decisões

1. **Região:** `5103007` entra em `regions[grande-cuiaba].cities`; a região `chapada` separada e o `suggestTo` saem. (Config em `kizuna.config.json`.)
2. **Modelo de conteúdo** (coleções do core `defineCollection`, em `src/lib/`):
   - `lugares` (existente) ganha campos opcionais: `tipo` (enum `dormir|comer|atracao`), `faixa_preco` (enum `$|$$|$$$`), `regiao` (slug de distrito/região), `melhor_epoca`, `tempo_visita`. Entradas antigas seguem válidas.
   - `roteiros` (novo): `titulo`, `cidade`, `resumo` (≤155), `status`, `atualizado_em`, `tema`, `duracao`, `dificuldade` (enum `facil|moderado|dificil`), `distancia`, `melhor_epoca`, `paradas` (lista de slugs de `lugares`), `creditos`. Fotos em `public/roteiros/<slug>/`.
   - `regioes` (novo): `titulo`, `cidade`, `resumo`, `status`, `atualizado_em`, `latitude`, `longitude`, `creditos`. Fotos em `public/regioes/<slug>/`.
3. **Onde mora o código:** blocos reutilizáveis (cartão de roteiro, linha do tempo de paradas, filtro por tipo, hero de turismo, grade de lugares) no `kizuna-core` em `src/client/components/turismo/`; leitura/composição das coleções no starter. As páginas só montam.
4. **Rotas:** `/turismo`, `/turismo/rotas`, `/turismo/dormir`, `/turismo/comer`, `/turismo/o-que-fazer`, `/turismo/regioes`; detalhe em `/[cidade]/roteiros/[slug]` e `/[cidade]/regioes/[slug]`; lugares seguem em `/[cidade]/lugares/[slug]`. Sitemap, JSON-LD (`TouristAttraction`, `Hotel`/`Restaurant`, `ItemList`) e links no header/rodapé.
5. **Qualidade do conteúdo:** fluxo `redacao-*` (pauta → apuração → escrita → imagens → revisão). Fonte rastreável para endereço, horário, preço e telefone; lacuna vira `[A CONFIRMAR]` e o item fica `rascunho`. Fotos só com licença livre registrada em `creditos`. `aprovado` só para o item completo, conferido e com foto boa.
6. **Lote inicial (meta):** ~10 rotas, 12 hospedagens, 15 restaurantes, 10 atrações, 5 distritos de Cuiabá, mais Chapada (atrações, hospedagem, comer). Por ondas; sobra vira pendente.

## Rotas-base (do portal da Prefeitura, textos nossos)

Cicloturismo · Balneários · Turismo ecológico urbano · Natureza e ecoturismo · Roteiros gastronômicos · Cervejarias artesanais · City tour · Pesca esportiva · Praças públicas · Chapada em 2 dias (extra).

## Critério de pronto

Testes das coleções e do carregamento passam; `tsc` e build limpos; sitemap lista só aprovados; ui-review sem defeito em 4 breakpoints; relatório do que ficou aprovado x pendente.
