# Hoje e Mapa: design

Duas telas novas, uma chamada para cada na home. O Hoje sai primeiro; o Mapa vem logo depois.

## Princípio

Reaproveitar o que o core já tem. Nada de coleção nova de conteúdo, nada de biblioteca de mapa nova. O mecanismo (carregador, blocos) fica no kizuna-core; a página do starter só configura e monta.

## Hoje

Página curada do Bora: o que tem para fazer hoje na cidade (e nas irmãs da região), em ordem de relevância.

Seções, na ordem (a ordem é a relevância):

1. Eventos de hoje: anúncios do grupo `eventos` cujo início cai hoje (fuso America/Cuiaba), do horário mais cedo ao mais tarde.
2. Cinema em cartaz: categoria `cinema`.
3. Bares: categoria `bares`.
4. Parques: categoria `parques`.

Regras:

- Seção sem item some. Se todas estiverem vazias, a página mostra um estado vazio com link para a busca.
- Dentro de bares e parques vale a ordem da busca do core: cidade do usuário primeiro, depois melhor avaliado. A semente é fixa por dia, então a lista não embaralha a cada visita.
- Sem "aberto agora" na v1.
- Fonte dos dados: os anúncios do banco, pela busca pública do core. Eventos e cinema entram pelos robôs de importação documentados em `docs/integracoes`. Bares e parques entram pela importação de lugares.

Reuso:

- Carregador novo no core, genérico: recebe a lista de seções (config) e devolve os itens, usando `runServiceSearch` e a resolução de categoria que o `loadCategoryRail` já faz.
- Cards: os do carrossel de anúncio que o core já tem, com o estilo por categoria (`serviceDetail`).
- Configuração em `kizuna.config.json`, chave `today.sections`, no mesmo formato de `home.categoryRails`.
- Clima do dia: o plugin de clima que já existe, se estiver ligado.

Home: uma chamada (cartão) para `/hoje`, com a data de hoje.

## Mapa

Tela só com cabeçalho, rodapé e o mapa.

- Mapa: estender o mapa próprio do core (tiles do OpenStreetMap, sem biblioteca), que já tem arrastar, pinça e zoom, com pinos.
- Toque num pino: abre no topo uma barra com "Calcular rota" (a barra de rota do core) e "Ver mais".
- "Ver mais": painel lateral com o detalhe do lugar, com 70% da largura no desktop e 100% no celular.
- Pontos: lugares publicados com coordenada.
- Limitação conhecida: poucos lugares têm coordenada. A geocodificação dos endereços é um passo à parte, com conferência humana antes de aprovar.

## Fora da v1

Aberto agora, favoritos, roteiro montado automaticamente.
