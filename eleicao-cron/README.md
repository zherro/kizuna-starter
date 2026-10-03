# eleicao-cron

Worker que espelha resultados do TSE (Presidente, Governador, Senador, Deputado Federal e
Deputado Estadual/Distrital) para JSON normalizado em `/data`. Sem banco, so Python e
`requests`.

Em vez de um ciclo unico, ha uma **fila de tarefas** processada **uma por vez**, num
unico loop (sem threads). Cada tarefa busca um arquivo (dados de um cargo e escopo, ou a
foto de um candidato), normaliza e grava de forma atomica.

## Fila

- Tarefas de dados: `presidente/BR`, `presidente/AC` ate `presidente/ZZ`, `governador/SP`,
  `senador/RJ` etc. Presidente tem BR, 27 UFs e ZZ (exterior); governador e senador, so as 27
  UFs (ZZ nao existe: 404 no TSE).
- Tarefas de foto: uma por candidato (`foto/senador/41627486`), baixadas uma unica vez.
- Prioridade: presidente, governador, senador, deputado-federal, deputado-estadual, fotos.
  Dentro da camada, vence a tarefa mais atrasada. Fotos so rodam quando nao ha dado vencido.
  Como o loop e de uma tarefa por vez, os 54 arquivos grandes de deputados (27 UFs x 2) nunca
  passam na frente do Presidente: no pior caso ele espera uma unica requisicao em andamento.
- Intervalos: `INTERVAL_PRESIDENTE=30`, `INTERVAL_GOVERNADOR=60`, `INTERVAL_SENADOR=60`,
  `INTERVAL_DEPUTADOS=300` (vale para deputado-federal e deputado-estadual)
  (segundos, contados do fim da tarefa). Pausa entre requisicoes: `REQUEST_PAUSE_MS=200`.
  Timeout de cada requisicao: 10s (`REQUEST_TIMEOUT`). Se a soma das requisicoes de uma
  rodada passar do intervalo, as tarefas rodam o mais rapido possivel, em ordem de atraso.
- Falha ou timeout: backoff exponencial por tarefa (30s, 60s, 120s, ate o teto de 600s); a
  proxima tarefa segue, uma UF travada nao bloqueia as demais. Sucesso zera o backoff.
- 404 de dados nao e erro: significa "sem arquivo" (ex.: 2o turno ainda nao publicado, UF sem
  esse cargo). Nova tentativa em `max(intervalo, NOTFOUND_RETRY=120)` segundos.
- 404 de foto: falha permanente, nao retenta por 1h (`FOTO_404_RETRY=3600`).
- Antes da apuracao (`ele-c.json` ou dados com 404) o status e `aguardando` e o ciclo e
  redescoberto a cada 60s (`DISCOVERY_WAIT`), nunca a cada tarefa. Depois de ok, a descoberta
  repete a cada 300s (`DISCOVERY_INTERVAL`) para pegar 2o turno novo.
- Ciclo e codigos de eleicao (`cd`) sao descobertos em
  `{TSE_BASE_URL}/{TSE_AMBIENTE}/comum/config/ele-c.json`; nada e fixo. Federal
  (`tp == "8"`) para Presidente, estadual (`tp == "1"`) para Governador e Senador. O 2o turno
  vem de `cdt2`: tenta o turno 2 e cai para o turno 1 em 404 (o 404 do turno 2 fica em cache
  por `NOTFOUND_RETRY`).

## Cargos

`CARGOS` (padrao `presidente,governador,senador,deputado-federal,deputado-estadual`) liga cargos. Cargos desligados nao geram
tarefas nem aparecem em `meta.json` (arquivos antigos de um cargo desligado ficam no disco).

| cargo | arquivo no TSE | escopos | vagas |
| --- | --- | --- | --- |
| presidente | c0001, eleicao federal | BR, UFs, ZZ | 1 |
| governador | c0003, eleicao estadual | UFs | 1 |
| senador | c0005, eleicao estadual | UFs | 2 (cada eleitor vota duas vezes) |
| deputado-federal | c0006, eleicao estadual | UFs | campo `nv` (69 em SP) |
| deputado-estadual | c0007, eleicao estadual (DF: c0008, Deputado Distrital) | UFs | varia por UF (94 em SP, 28 no DF) |

### Deputados

Ligados por padrao. Para desligar (sem tarefas, sem arquivos novos, fora do `meta.json`):

    CARGOS=presidente,governador,senador

Saida `deputado-federal/SP.json` e `deputado-estadual/SP.json`, mesmo contrato dos outros
cargos, com dois campos a mais: `coligacao` por candidato (`str|null`: federacao ou coligacao
do agrupamento, `null` quando e o proprio partido) e `cargoNome` no topo ("Deputado Federal",
"Deputado Estadual" ou "Deputado Distrital"). `partido` e a sigla do partido.

O DF nao elege deputado estadual, e sim **Deputado Distrital**: o cargo `deputado-estadual`
usa `c0007` nas UFs e `c0008` no DF (`df-c0007` da 404 no TSE). O arquivo sai em
`deputado-estadual/DF.json` com `cargoNome` "Deputado Distrital". ZZ nao existe para
deputados (404 = sem arquivo, como no governador).

Para poupar espaco e requisicoes, o JSON de deputados (e dos demais cargos) e gravado
compacto, sem indentacao. O worker **nao baixa fotos de deputados** (~18 mil). O `meta.json`
traz `base` e, por cargo, `ciclo` e `eleicao`; o site monta a URL e busca a foto no TSE sob
demanda:

    {base}/{ambiente}/{ciclo}/{eleicao}/fotos/{uf minuscula}/{sqcand}.jpeg

Exemplo real no simulado (deputado federal de SP):
`https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21272/fotos/sp/41627126.jpeg`.

### Tamanho no volume

Medido (`du -sh`) com o ciclo completo do simulado: `deputado-federal/` 2,2MB (27 UFs; SP 308KB),
`deputado-estadual/` 3,7MB (SP 434KB, DF 128KB), `presidente/` 124KB, `governador/` 116KB,
`senador/` 144KB e `fotos/` 7MB (852 fotos de presidente, governador e senador). Total
~13MB, dos quais ~6MB sao deputados. O JSON compacto de deputado fica ~74% do bruto do TSE.
Se o site servir com gzip, o trafego cai bem mais.

## Saida em DATA_DIR

Escrita atomica (tmp + rename), modo 644, so reescreve quando o conteudo muda. Em falha, o
ultimo arquivo bom e mantido.

- `meta.json`: `status` (`ok` ou `aguardando`), `atualizadoEm`, `base` (TSE_BASE_URL), `ambiente`, `ciclo`, `ufs`
  (uniao das UFs com arquivo; ZZ so por causa do presidente) e `cargos`, um objeto por
  cargo ligado com dados: `eleicao`, `ciclo`, `turno`, `atualizadoEm` (ultima busca com sucesso), `tse`
  (`dg`, `hg` mais recentes do TSE) e `ufs` (UFs com arquivo para aquele cargo).
- `presidente/BR.json`, `presidente/SP.json`, `governador/SP.json`, `senador/SP.json` e
  demais: um por cargo e escopo (BR so para presidente). Campos: `cargo`, `escopo`, `turno`,
  `tse`, `totalizacao` (campos abaixo), `vagas` e
  `candidatos` ordenados por votos (`seq`, `numero`, `sqcand`, `nome`, `partido`, `votos`,
  `percentual`, `situacao`, `eleito`).
  Todos os campos de `totalizacao` sao numero ou `null` (ausente no bruto).
- `fotos/SQCAND.jpeg`: foto de cada candidato de presidente, governador e senador (deputados nao).
- `status.json`: saude do worker (abaixo).

A estrutura antiga (`nacional.json` e a pasta `uf/`) e removida na inicializacao.

### Totalizacao: campo -> origem no JSON do TSE

Blocos `s` (secoes), `e` (eleitorado) e `v` (votos) no topo do JSON; sao iguais em todos os
cargos (presidente BR/UF, governador, senador, deputados, inclusive o distrital do DF). Os
percentuais usam a variante numerica (sufixo `n`, ex. `pcn` = `85,150902319`) e so caem para a
variante pt-BR (`pvv` = `83,66`) se a numerica faltar.

| Campo | Origem | Significado |
|---|---|---|
| `pctSecoes` | `s.pstn` | % de secoes totalizadas |
| `votosValidos` | `v.vv` | votos validos (nominais + legenda, sem anulados) |
| `brancos` | `v.vb` | votos em branco |
| `nulos` | `v.tvn` (ou `v.vn`) | votos nulos |
| `secoesTotal` | `s.ts` | secoes do escopo |
| `secoesTotalizadas` | `s.st` | secoes ja totalizadas |
| `secoesNaoTotalizadas` | `s.snt` | secoes pendentes |
| `eleitorado` | `e.te` | eleitores aptos |
| `eleitoradoApurado` | `e.est` | eleitores das secoes totalizadas |
| `pEleitoradoApurado` | `e.pestn` | % do eleitorado apurado |
| `comparecimento` | `e.c` | eleitores que compareceram |
| `pComparecimento` | `e.pcn` | % de comparecimento (sobre `te`) |
| `abstencoes` | `e.a` | abstencoes |
| `pAbstencao` | `e.pan` | % de abstencao (sobre `te`) |
| `votosTotais` | `v.tv` | total de votos apurados |
| `pValidos` | `v.pvvn` | % de `votosValidos` (base: votos em candidatos/legenda `vvc`, nao `tv`) |
| `pBrancos` | `v.pvbn` | % de brancos sobre `votosTotais` |
| `pNulos` | `v.ptvnn` | % de nulos sobre `votosTotais` |

Notas de conferencia (presidente/BR): `votosTotais = vvc + brancos + nulos` (120704576 + 9118018 +
9040537 = 138863131), e `votosValidos + van + vansj = vvc`; logo `votosValidos + brancos + nulos`
NAO fecha em `votosTotais` (faltam os votos anulados/anulados sub judice, `van` e `vansj`, que o
worker nao exporta). `pValidos` (83,66) tem base `vvc`, enquanto `pBrancos` e `pNulos` tem base
`votosTotais`; nao somam 100. No senador (2 votos por eleitor) `votosTotais` e ~2x o
`comparecimento`.

### Senador: vagas

O TSE informa o numero de vagas em `nv` do cargo (senador: 2; governador e presidente: 1),
exposto como `vagas`. Cada candidato ao Senado traz dois suplentes em `vs`, ignorados. Com 2
vagas, ate dois candidatos vem com `eleito` verdadeiro, e como cada eleitor vota duas vezes,
a soma de `votos` pode passar de `votosValidos`. O `percentual` e o do proprio TSE (`pvapn`).
Atencao: o `vag` dentro de cada agrupamento (`agr`) e de cadeiras do partido, nao as vagas
do cargo.

## Logs

Uma linha por tarefa, no stdout, sem buffer (pt-BR). Use `docker logs -t` para ter horario.

    ok presidente/BR 200 10.0KB 310ms mudou
    ok senador/RJ 200 8.1KB 280ms sem-mudanca
    ok foto/senador/41627486 200 5.0KB 120ms baixada
    fail senador/AC timeout 10s retry em 60s (tentativa 2)
    skip governador/ZZ 404 sem-arquivo retry em 120s
    fail foto/governador/123 404 permanente retry em 3600s
    resumo: 54 ok, 2 falhas, fila 12, presidente/BR atualizado há 18s, arquivos ok por cargo: presidente=29 governador=27 senador=27 deputado-federal=27 deputado-estadual=27

O resumo sai a cada 60s. `fila` e quantas tarefas estao vencidas (inclui fotos pendentes).
Acompanhar:

    docker logs -f -t eleicao-cron
    docker logs --since 5m eleicao-cron | grep ^fail

## status.json

Reescrito a cada tarefa de dados e a cada 10s:

- `startedAt`, `heartbeat` (ISO, UTC), `status` (`ok` ou `aguardando`) e `queue` (tarefas
  vencidas).
- `tasks`: por tarefa de dados (`presidente/BR` etc.), `lastRun`, `lastOk`, `result`
  (`ok`, `unchanged`, `404`, `timeout`, `error`), `ms`, `bytes`, `attempts` (falhas seguidas;
  0 se ok) e `nextRun`.
- `counts`: `ok` e `fail` acumulados desde o inicio (inclui fotos; 404 de dados nao conta).
- `fotos`: `baixadas`, `pendentes`, `falhas` (404 aguardando nova tentativa).

Ler de dentro do container:

    docker exec eleicao-cron cat /data/status.json

## Healthcheck

`healthcheck.py` (Dockerfile e compose) le `status.json`. Fica unhealthy se o `heartbeat` tem
mais de 120s, ou se o `status` e `ok` e `presidente/BR` nao tem sucesso ha mais de 180s (sem
nenhum sucesso, conta desde `startedAt`). Em `aguardando` basta o heartbeat vivo.

    docker inspect --format '{{.State.Health.Status}}' eleicao-cron
    docker exec eleicao-cron python healthcheck.py

## Uso

    cp .env.example .env
    docker compose up -d --build

Teste de uma passada, sem loop (processa a fila uma vez, inclusive as fotos):

    DATA_DIR=./out python worker.py --once

Se o ambiente local tiver proxy ou antivirus que intercepta SSL, rode com o truststore apenas
no seu comando de teste (nao faz parte do `requirements`):

    python -c "import truststore,sys; truststore.inject_into_ssl(); import worker; sys.argv=['worker.py','--once']; worker.main()"

## Fonte (TSE)

- Simulado (padrao): `https://resultados-sim.tse.jus.br` + `simulado/simulado2026`.
- Producao: `https://resultados.tse.jus.br` + ambiente oficial. **Valide a URL e o
  ambiente no DevTools (aba Network) do painel de resultados do TSE** antes de usar.
- Dados: `{base}/{ambiente}/{ciclo}/{cd}/dados/{uf}/{uf}-{cargo}-e{cd6}-u.json` (UF em minuscula,
  `br` para o nacional, `cd6` com 6 digitos).
- Fotos: `{base}/{ambiente}/{ciclo}/{cd}/fotos/{uf}/{sqcand}.jpeg` (presidente usa `br`;
  governador e senador, a UF do estado).

## Compartilhar o volume com o Next

Use um bind mount no `docker-compose.yml` (`- ./data:/data`) e aponte o Next
para o mesmo diretorio do host:

    ELEICAO_DATA_PATH=/caminho/absoluto/eleicao-cron/data

Com volume nomeado, monte `eleicao-data` (somente leitura) no container do Next.

## Testes

    python -m unittest -v

Fixtures reais do simulado em `tests/fixtures`. Nao precisa de `pytest`.
